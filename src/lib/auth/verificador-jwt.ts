import { CognitoJwtVerifier } from 'aws-jwt-verify'

let verificador: ReturnType<typeof CognitoJwtVerifier.create> | null = null

function obterVerificador() {
  if (verificador) return verificador

  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.COGNITO_CLIENT_ID
  if (!userPoolId || !clientId) {
    throw new Error('COGNITO_USER_POOL_ID e COGNITO_CLIENT_ID ausentes')
  }

  verificador = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'id',
    clientId,
  })
  return verificador
}

export async function verificarIdToken(token: string) {
  return obterVerificador().verify(token)
}
