'use client';

import { useState } from 'react';
import DropzoneFileUploader from '@/components/DropzoneFileUploader';

export default function DropzonePage() {
  const [uploadedFileUrls, setUploadedFileUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleUploadComplete = (urls: string[]) => {
    setUploadedFileUrls(prev => [...prev, ...urls]);
    setError(null);
  };

  const handleError = (error: string) => {
    setError(error);
  };

  return (
    <main className="min-h-screen p-8 text-center">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center">Dropzone - File Uploader</h1>
        
        <DropzoneFileUploader
          onUploadComplete={handleUploadComplete}
          onError={handleError}
        />

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {uploadedFileUrls.length > 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600">Files uploaded successfully!</p>
            <div className="mt-2 space-y-2">
              {uploadedFileUrls.map((url, index) => (
                <p key={index} className="text-sm text-gray-600 break-all">
                  URL {index + 1}: {url}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}