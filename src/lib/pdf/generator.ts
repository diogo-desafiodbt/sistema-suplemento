import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { PrescriptionDocument } from './prescription-template'
import { createHash } from 'crypto'

type PrescriptionData = Parameters<typeof PrescriptionDocument>[0]['data']

export async function generatePrescriptionPdf(data: PrescriptionData): Promise<{
  buffer: Buffer
  hash: string
}> {
  const element = createElement(PrescriptionDocument, { data }) as ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  const hash = createHash('sha256').update(buffer).digest('hex')
  return { buffer: Buffer.from(buffer), hash }
}
