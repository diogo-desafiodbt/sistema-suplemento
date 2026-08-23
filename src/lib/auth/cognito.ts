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

export async function entrar(
  email: string,
  senha: string,
): Promise<{ idToken: string; accessToken: string; refreshToken: string } | null> {
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
