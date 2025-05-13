'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone, FileRejection, FileError } from 'react-dropzone';
import { X, Upload, Image as ImageIcon, Film, AlertCircle, CheckCircle2, Loader2, File } from 'lucide-react';
import Image from 'next/image';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  onUploadComplete: (urls: string[]) => void;
  onError: (error: string) => void;
}

interface FileWithPreview extends File {
  preview: string | undefined;
  id: string;
  uploadProgress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  originalFile: File;
  xhr?: XMLHttpRequest;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

const ACCEPTED_IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

const ACCEPTED_VIDEO_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],
};

export default function DropzoneFileUploader({ onUploadComplete, onError }: FileUploaderProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    // Handle rejected files first
    fileRejections.forEach(({ file, errors }) => {
      const errorMessages = errors.map((error: FileError) => {
        switch (error.code) {
          case 'file-too-large':
            const maxSize = file.type.startsWith('image/') ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
            const maxSizeInMB = maxSize / (1024 * 1024);
            return `${file.name} is too large. Maximum size is ${maxSizeInMB}MB`;
          case 'file-invalid-type':
            return `${file.name} has an invalid file type. Only images (JPG, PNG, WebP, GIF) and videos (MP4, MOV, AVI, WebM) are allowed`;
          default:
            return `${file.name}: ${error.message}`;
        }
      });
      errorMessages.forEach(message => onError(message));
    });

    // Process accepted files
    const newFiles = acceptedFiles.map(file => {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;

      if (file.size > maxSize) {
        const maxSizeInMB = maxSize / (1024 * 1024);
        onError(`${file.name} exceeds the ${maxSizeInMB}MB size limit`);
        return null;
      }

      const fileWithPreview: FileWithPreview = {
        ...file,
        originalFile: file,
        preview: isImage ? URL.createObjectURL(file) : undefined,
        id: `${file.name}-${Date.now()}`,
        uploadProgress: 0,
        status: 'pending' as const,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        slice: file.slice.bind(file),
      };

      return fileWithPreview;
    }).filter((file): file is FileWithPreview => file !== null);

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { ...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES },
    validator: (file) => {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
      
      if (file.size > maxSize) {
        const maxSizeInMB = maxSize / (1024 * 1024);
        return {
          code: 'file-too-large',
          message: `File is larger than ${maxSizeInMB} MB`
        };
      }
      
      return null;
    }
  });

  const removeFile = (fileId: string) => {
    setFiles(prev => {
      const fileToRemove = prev.find(f => f.id === fileId);
      
      if (fileToRemove?.xhr && fileToRemove.status === 'uploading') {
        fileToRemove.xhr.abort();
      }
      
      const filtered = prev.filter(f => f.id !== fileId);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }

      const hasUploadingFiles = filtered.some(f => f.status === 'uploading');
      if (!hasUploadingFiles) {
        setIsUploading(false);
      }

      return filtered;
    });
  };

  const uploadFile = async (file: FileWithPreview) => {
    try {
      // Get presigned URL
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

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await response.json();

      // Upload file with progress tracking
      const xhr = new XMLHttpRequest();
      
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, xhr }
            : f
        )
      );
      
      xhr.open('PUT', uploadURL);
      xhr.setRequestHeader('Content-Type', file.type);

      return new Promise<string>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setFiles(prev =>
              prev.map(f =>
                f.id === file.id
                  ? { ...f, uploadProgress: progress, status: 'uploading' }
                  : f
              )
            );
          }
        };

        xhr.onload = async () => {
          if (xhr.status === 200) {
            // Get the viewable URL
            const key = uploadURL.split('?')[0].split('/uploads/')[1];
            const viewResponse = await fetch(`/api/upload?key=uploads/${key}`, {
              headers: {
                'x-csrf-token': 'your-csrf-token',
              },
            });
            
            if (!viewResponse.ok) {
              throw new Error('Failed to get view URL');
            }

            const { url } = await viewResponse.json();
            resolve(url);
          } else {
            reject(new Error('Upload failed'));
          }
        };

        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(file.originalFile);
      });
    } catch (error) {
      throw error;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const uploadedUrls: string[] = [];
    const pendingFiles = files.filter(f => f.status === 'pending');

    try {
      await Promise.all(
        pendingFiles.map(async (file) => {
          try {
            const url = await uploadFile(file);
            uploadedUrls.push(url);
            setFiles(prev =>
              prev.map(f =>
                f.id === file.id
                  ? { ...f, status: 'success' }
                  : f
              )
            );
          } catch (error) {
            console.error('Upload error:', error);
            setFiles(prev =>
              prev.map(f =>
                f.id === file.id
                  ? { ...f, status: 'error', errorMessage: 'Upload failed' }
                  : f
              )
            );
            onError(`Failed to upload ${file.name}`);
          }
        })
      );

      if (uploadedUrls.length > 0) {
        onUploadComplete(uploadedUrls);
        setOpen(false);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (file: FileWithPreview) => {
    // Early return with default icon if file object is invalid
    if (!file) {
      return <File className="h-12 w-12 text-muted-foreground" />;
    }

    const fileType = file.type || '';
    const fileName = file.name || '';

    // Try to determine type from MIME type first
    if (fileType.startsWith('image/')) {
      return file.preview ? (
        <div className="relative h-12 w-12 overflow-hidden rounded">
          <Image
            src={file.preview}
            alt={fileName}
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
      ) : (
        <ImageIcon className="h-12 w-12 text-muted-foreground" />
      );
    }
    
    if (fileType.startsWith('video/')) {
      return <Film className="h-12 w-12 text-muted-foreground" />;
    }

    // Fallback to extension check if MIME type doesn't help
    if (fileName) {
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      
      // Check for image extensions
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
        return file.preview ? (
          <div className="relative h-12 w-12 overflow-hidden rounded">
            <Image
              src={file.preview}
              alt={fileName}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground" />
        );
      }
      
      // Check for video extensions
      if (['mp4', 'mov', 'avi', 'webm'].includes(extension)) {
        return <Film className="h-12 w-12 text-muted-foreground" />;
      }
    }
    
    // Default fallback
    return <File className="h-12 w-12 text-muted-foreground" />;
  };

  const getStatusIcon = (status: FileWithPreview['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 data-testid="upload-success-icon" className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle data-testid="upload-error-icon" className="w-5 h-5 text-red-500" />;
      case 'uploading':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  useEffect(() => {
    // Cleanup function to revoke object URLs when component unmounts
    return () => {
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  useEffect(() => {
    // Clear files when dialog closes
    if (!open && files.length) {
      // Revoke all object URLs before clearing files
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      setFiles([]);
    }
  }, [open, files]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Upload Files</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-center">Upload photos & videos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragActive ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
            )}
          >
            <input {...getInputProps()} />
            <div className="space-y-2">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isDragActive
                  ? "Drop the files here"
                  : "Drag & drop files here, or click to select files"}
              </p>
              <p className="text-xs text-muted-foreground">
                Images (up to 5MB): JPG, PNG, WebP, GIF
                <br />
                Videos (up to 50MB): MP4, MOV, AVI, WebM
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-2 overflow-y-auto max-h-[300px]">
              {files.map((file, index) => (
                <div
                  key={file.id}
                  className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30"
                >
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {file.name || 'Unnamed File'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                    {file.status === 'uploading' && (
                      <Progress value={file.uploadProgress} className="h-1 mt-2" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(file.status)}
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-1 rounded-full hover:bg-muted cursor-pointer"
                      aria-label={file.status === 'uploading' ? "Cancel upload" : "Remove file"}
                      data-testid={`cancel-upload-button-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || files.every(f => f.status === 'success')}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload Files'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
