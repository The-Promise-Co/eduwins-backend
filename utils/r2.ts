import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from './logger';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicDomain = process.env.R2_PUBLIC_CUSTOM_DOMAIN;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  logger.warn('Cloudflare R2 is not fully configured in environment variables.');
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
});

/**
 * Generate a presigned URL for uploading a file to Cloudflare R2
 * @param filename The original filename
 * @param contentType The MIME type of the file
 * @param folder The folder path/prefix in the bucket
 * @returns An object with the uploadUrl and the publicUrl of the file
 */
export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  folder = 'eduwins'
) {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${folder}/${uniqueSuffix}-${cleanFilename}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  
  // Format public custom domain properly
  let baseUrl = publicDomain;
  if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  
  const publicUrl = baseUrl 
    ? `${baseUrl}/${key}` 
    : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;

  return {
    uploadUrl,
    publicUrl,
    key,
  };
}
