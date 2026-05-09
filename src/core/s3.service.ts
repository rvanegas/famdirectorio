import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config'

function getS3Config() {
  if (!config.s3) throw new Error('No [s3] section found in config.')
  return config.s3
}

function buildKey(version: number, pdfPath: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const ext = path.extname(pdfPath)
  return `Libro de Durán Mazuera ${date} v${version}${ext}`
}

export function buildCloudfrontUrl(version: number, pdfPath: string): string {
  const s3 = getS3Config()
  const key = buildKey(version, pdfPath)
  return `${s3.cloudfront_url}/${encodeURIComponent(key)}`
}

export async function uploadPdf(pdfPath: string, version: number): Promise<string> {
  const s3 = getS3Config()
  const key = buildKey(version, pdfPath)

  const client = new S3Client({
    region: s3.region,
    credentials: {
      accessKeyId: s3.access_key_id,
      secretAccessKey: s3.secret_access_key,
    },
  })

  await client.send(new PutObjectCommand({
    Bucket: s3.bucket,
    Key: key,
    Body: fs.readFileSync(pdfPath),
    ContentType: 'application/pdf',
    ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(key)}`,
  }))

  return `${s3.cloudfront_url}/${encodeURIComponent(key)}`
}
