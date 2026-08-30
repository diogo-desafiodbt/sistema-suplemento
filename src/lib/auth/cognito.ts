import { createHmac } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider'

const REGION = process.env.AWS_REGION ?? 'us-east-1'

function configuracao() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.COGNITO_CLIENT_ID
  const clientSecret = process.env.COGNITO_CLIENT_SECRET
  if (!userPoolId || !clientId || !clientSecret) {
    throw new Error(
      'COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID e COGNITO_CLIENT_SECRET ausentes',
    )
  }
  return { userPoolId, clientId, clientSecret }
}

function secretHash(username: string, clientId: string, clientSecret: string) {
  return createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64')
}

function cliente() {
  return new CognitoIdentityProviderClient({ region: REGION })
}

export class EmailJaCadastradoError extends Error {
  constructor() {
    super('Email já cadastrado')
    this.name = 'EmailJaCadastradoError'
  }
}

export type Tokens = {
  idToken: string
  accessToken: string
  refreshToken: string
}

/**
 * O que o login devolve.
 *
 * `mfa` não é erro: é o Cognito dizendo que a senha estava certa e falta o
 * segundo fator. Antes, qualquer resposta sem tokens virava `null`, e a tela
 * mostrava "e-mail ou senha incorretos" — ligar MFA no console teria derrubado
 * o login de todos sem nenhuma pista do motivo.
 */
export type ResultadoEntrar =
  | { tipo: 'ok'; tokens: Tokens }
  | { tipo: 'mfa'; sessao: string; usuario: string }
  | { tipo: 'cadastrar_mfa'; sessao: string; usuario: string }
  | { tipo: 'erro' }

export async function entrar(
  email: string,
  senha: string,
): Promise<ResultadoEntrar> {
  const { clientId, clientSecret } = configuracao()
  try {
    const resultado = await cliente().send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: senha,
          SECRET_HASH: secretHash(email, clientId, clientSecret),
        },
      }),
    )
    const auth = resultado.AuthenticationResult
    if (auth?.IdToken && auth.AccessToken && auth.RefreshToken) {
      return {
        tipo: 'ok',
        tokens: {
          idToken: auth.IdToken,
          accessToken: auth.AccessToken,
          refreshToken: auth.RefreshToken,
        },
      }
    }

    const desafio = resultado.ChallengeName
    const sessao = resultado.Session
    const usuario = resultado.ChallengeParameters?.USER_ID_FOR_SRP ?? email

    if (sessao && desafio === 'SOFTWARE_TOKEN_MFA') {
      return { tipo: 'mfa', sessao, usuario }
    }
    // Quando o MFA é obrigatório e a pessoa ainda não cadastrou o aplicativo,
    // o Cognito manda cadastrar antes de deixar entrar.
    if (sessao && desafio === 'MFA_SETUP') {
      return { tipo: 'cadastrar_mfa', sessao, usuario }
    }

    return { tipo: 'erro' }
  } catch {
    return { tipo: 'erro' }
  }
}

/** Segundo passo: o código de seis dígitos do aplicativo autenticador. */
export async function responderMfa(
  usuario: string,
  sessao: string,
  codigo: string,
): Promise<Tokens | null> {
  const { clientId, clientSecret } = configuracao()
  try {
    const resultado = await cliente().send(
      new RespondToAuthChallengeCommand({
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ClientId: clientId,
        Session: sessao,
        ChallengeResponses: {
          USERNAME: usuario,
          SOFTWARE_TOKEN_MFA_CODE: codigo,
          SECRET_HASH: secretHash(usuario, clientId, clientSecret),
        },
      }),
    )
    const auth = resultado.AuthenticationResult
    if (!auth?.IdToken || !auth.AccessToken || !auth.RefreshToken) return null
    return {
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken,
    }
  } catch {
    return null
  }
}

/** Começa o cadastro do autenticador: devolve o segredo para virar QR Code. */
export async function comecarCadastroMfa(
  accessToken: string,
): Promise<string | null> {
  try {
    const r = await cliente().send(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    )
    return r.SecretCode ?? null
  } catch {
    return null
  }
}

/** Confirma o cadastro e liga o TOTP para a pessoa. */
export async function confirmarCadastroMfa(
  accessToken: string,
  codigo: string,
): Promise<boolean> {
  try {
    const r = await cliente().send(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: codigo,
      }),
    )
    if (r.Status !== 'SUCCESS') return false

    await cliente().send(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    )
    return true
  } catch {
    return false
  }
}

export async function renovar(
  refreshToken: string,
  sub: string,
): Promise<{ idToken: string; accessToken: string } | null> {
  const { clientId, clientSecret } = configuracao()
  try {
    const resultado = await cliente().send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: secretHash(sub, clientId, clientSecret),
        },
      }),
    )
    const auth = resultado.AuthenticationResult
    if (!auth?.IdToken || !auth.AccessToken) return null
    return { idToken: auth.IdToken, accessToken: auth.AccessToken }
  } catch {
    return null
  }
}

export async function criarUsuario(email: string, senha: string): Promise<string> {
  const { userPoolId } = configuracao()
  const cognito = cliente()
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    )
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      throw new EmailJaCadastradoError()
    }
    throw error
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: senha,
      Permanent: true,
    }),
  )

  const usuario = await cognito.send(
    new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: email,
    }),
  )
  const sub = usuario.UserAttributes?.find((a) => a.Name === 'sub')?.Value
  if (!sub) throw new Error('sub ausente após criar usuário')
  return sub
}

export async function esqueciSenha(email: string): Promise<void> {
  const { clientId, clientSecret } = configuracao()
  try {
    await cliente().send(
      new ForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        SecretHash: secretHash(email, clientId, clientSecret),
      }),
    )
  } catch {
    // PreventUserExistenceErrors no pool — resposta igual exista ou não o e-mail.
  }
}

export async function confirmarNovaSenha(
  email: string,
  codigo: string,
  senha: string,
): Promise<void> {
  const { clientId, clientSecret } = configuracao()
  await cliente().send(
    new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: codigo,
      Password: senha,
      SecretHash: secretHash(email, clientId, clientSecret),
    }),
  )
}

export async function sair(accessToken: string): Promise<void> {
  try {
    await cliente().send(new GlobalSignOutCommand({ AccessToken: accessToken }))
  } catch {
    // O navegador já vai perder os cookies — não bloqueia o logout.
  }
}

export function subDoTokenJwt(token: string): string | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const payload = JSON.parse(
      Buffer.from(partes[1], 'base64url').toString('utf8'),
    ) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
