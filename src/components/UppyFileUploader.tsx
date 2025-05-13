'use client';

import { useEffect, useState, useRef } from 'react';
import Uppy, { UppyFile } from '@uppy/core';
import type { Meta } from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { Dashboard } from '@uppy/react';
import ImageEditor from '@uppy/image-editor';

// Import Uppy styles
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.min.css';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from './ui/button';

interface FileUploaderProps {
  onUploadComplete: (urls: string[]) => void;
  onError: (error: string) => void;
}

interface UploadState {
  urls: string[];
  pending: Set<string>;
  isUploading: boolean;
  currentBatchUrls: Map<string, string>;
}

const INITIAL_STATE: UploadState = {
  urls: [],
  pending: new Set(),
  isUploading: false,
  currentBatchUrls: new Map(),
};

const UPPY_CONFIG = {
  restrictions: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxNumberOfFiles: 10,
    allowedFileTypes: [
      'image/*',
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm'
    ]
  },
  autoProceed: false,
  allowMultipleUploadBatches: true,
};

export default function UppyFileUploader({ onUploadComplete, onError }: FileUploaderProps) {
  const [uppy, setUppy] = useState<Uppy | null>(null);
  const [open, setOpen] = useState(false);
  const state = useRef<UploadState>({ ...INITIAL_STATE });

  useEffect(() => {
    const uppyInstance = new Uppy(UPPY_CONFIG)
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: async (file) => {
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': 'your-csrf-token',
            },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
            }),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.error || 'Failed to get upload URL');
          }
          
          return {
            method: 'PUT',
            url: data.uploadURL,
            fields: {},
            headers: {
              'Content-Type': file.type,
            },
          };
        },
      })
      .use(ImageEditor, {
        id: 'ImageEditor',
        quality: 0.8,
        cropperOptions: {
          viewMode: 1,
          background: false,
          autoCropArea: 1,
          responsive: true,
        },
      });

    uppyInstance.on('upload', () => {
      console.log('Starting new upload');
      state.current = {
        ...state.current,
        pending: new Set(),
        isUploading: true,
        currentBatchUrls: new Map(),
      };
    });

    uppyInstance.on('upload-success', async (file: UppyFile<Meta, Record<string, never>> | undefined, response: { body?: Record<string, never> | undefined; status: number; bytesUploaded?: number; uploadURL?: string; }) => {
      if (!file?.name || !file?.id) return;
      
      console.log('File upload success:', file.name);
      state.current.pending.add(file.id);
      
      try {
        const uploadURL = response.uploadURL as string;
        const key = uploadURL.split('?')[0].split('/uploads/')[1];
        
        console.log('Getting presigned URL for:', file.name, 'with key:', key);
        const viewResponse = await fetch(`/api/upload?key=uploads/${key}`, {
          headers: {
            'x-csrf-token': 'your-csrf-token',
          },
        });
        
        const viewData = await viewResponse.json();
        
        if (!viewResponse.ok) {
          throw new Error(viewData.error || 'Failed to get view URL');
        }
        
        state.current.urls.push(viewData.url);
        state.current.currentBatchUrls.set(file.id, viewData.url);
        state.current.pending.delete(file.id);
        
        console.log('Added URL for file:', file.name, 'Total URLs:', state.current.currentBatchUrls.size);
      } catch (error) {
        state.current.pending.delete(file.id);
        console.error('Error getting view URL for file:', file.name, error);
        onError(`Upload succeeded but failed to get view URL for ${file.name}`);
      }
    });

    uppyInstance.on('upload-error', (file: UppyFile<Meta, Record<string, never>> | undefined, error: { message?: string }) => {
      if (!file?.name || !file?.id) return;
      console.error('Upload error for file:', file.name, error);
      state.current.pending.delete(file.id);
      onError(`Upload failed for ${file.name}: ${error.message || 'Unknown error'}`);
    });

    uppyInstance.on('complete', (result) => {
      const { failed = [], successful = [] } = result;
      
      console.log('Upload complete:', {
        successful: successful.map(f => f.name),
        failed: failed.map(f => f.name),
        pendingUrls: state.current.pending.size,
        urls: Array.from(state.current.currentBatchUrls.values()),
      });
      
      if (failed.length > 0) {
        onError(`${failed.length} file(s) failed to upload: ${failed.map(f => f.name).join(', ')}`);
      }

      // Wait for all presigned URLs to be fetched
      const checkCompletion = () => {
        if (state.current.pending.size === 0) {
          const urls = Array.from(state.current.currentBatchUrls.values());
          if (urls.length > 0) {
            console.log('All files processed, sending URLs:', urls);
            onUploadComplete(urls);
            state.current.isUploading = false;
            setOpen(false);
          }
        } else {
          // Check again in a moment
          setTimeout(checkCompletion, 100);
        }
      };

      checkCompletion();
    });

    setUppy(uppyInstance);

    return () => {
      uppyInstance.cancelAll();
    };
  }, [onUploadComplete, onError]);

  if (!uppy) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Upload Files</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-center">File Uploader</DialogTitle>
        </DialogHeader>
        <Dashboard
          uppy={uppy}
          plugins={['ImageEditor']}
          width="100%"
          height="500px"
          proudlyDisplayPoweredByUppy={false}
          showProgressDetails
          showSelectedFiles
          doneButtonHandler={() => {
            uppy.cancelAll();
            setOpen(false);
          }}
          locale={{
            strings: {
              closeModal: 'Close',
              addMoreFiles: 'Add more files',
              importFrom: 'Import files from',
              dashboardWindowTitle: 'File Uploader',
              dashboardTitle: 'File Uploader',
              copyLinkToClipboardSuccess: 'Link copied to clipboard',
              copyLinkToClipboardFallback: 'Copy the URL below',
              dropPasteFiles: 'Drop files here or %{browseFiles}',
              browseFiles: 'Browse files',
              uploadComplete: 'Upload complete',
              uploadFailed: 'Upload failed',
              poweredBy: 'Powered by %{uppy}',
              removeFile: 'Remove file',
              done: 'Done'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
          }}
        />
      </DialogContent>
    </Dialog>
  );
}