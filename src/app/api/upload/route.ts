import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Helper function to handle CORS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function corsResponse(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-csrf-token',
      'Content-Type': 'application/json',
    },
  });
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const { filename, contentType } = await request.json();

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `uploads/${Date.now()}-${filename}`,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return corsResponse({
      uploadURL: presignedUrl,
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return corsResponse(
      { error: 'Failed to generate upload URL' },
      500
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return corsResponse(
        { error: 'Key is required' },
        400
      );
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return corsResponse({
      url: presignedUrl,
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return corsResponse(
      { error: 'Failed to generate download URL' },
      500
    );
  }
}