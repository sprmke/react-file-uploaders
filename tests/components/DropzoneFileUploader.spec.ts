import { test, expect } from '@playwright/test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test file paths
const TEST_IMAGE = join(__dirname, '../fixtures/test-img.png');
const TEST_VIDEO = join(__dirname, '../fixtures/test-video.mov');

test.describe('Dropzone Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the actual dropzone page with retry and timeout
    try {
      await page.goto('/dropzone', { 
        waitUntil: 'networkidle',
        timeout: 60000 // 60 seconds timeout
      });
    } catch (error) {
      console.error('Failed to load page:', error);
      throw error;
    }
  });

  test('displays the page title and upload button', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Dropzone - File Uploader' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload Files' })).toBeVisible();
  });

  test('opens upload dialog and shows file type information', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Files' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Images (up to 5MB): JPG, PNG, WebP, GIF')).toBeVisible();
    await expect(page.getByText('Videos (up to 50MB): MP4, MOV, AVI, WebM')).toBeVisible();
  });

  test('handles image file selection and displays preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Files' }).click();
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drag & drop files here, or click to select files').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([TEST_IMAGE]);

    // Verify file appears in list with preview
    await expect(page.getByText('test-img.png')).toBeVisible();
    // Check for image preview (img tag should exist)
    await expect(page.locator('img[alt="test-img.png"]')).toBeVisible();
  });

  test('handles video file selection', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Files' }).click();
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drag & drop files here, or click to select files').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([TEST_VIDEO]);

    // Verify file appears in list
    await expect(page.getByText('test-video.mov')).toBeVisible();
    // Video files should show the Film icon
    await expect(page.locator('svg.lucide-film')).toBeVisible();
  });

  test('handles successful file upload, closes dialog, and displays uploaded URLs', async ({ page }) => {
    // Mock successful upload URL generation and viewable URL retrieval
    await page.route('/api/upload', async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ uploadURL: 'test-url' })
        });
      } else if (url.includes('?key=')) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ url: 'https://example.com/test-image.png' })
        });
      }
    });

    // Mock the PUT request
    await page.route('test-url', async (route) => {
      await route.fulfill({ status: 200 });
    });

    // Open upload dialog
    await page.getByRole('button', { name: 'Upload Files' }).click();
    
    // Select file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drag & drop files here, or click to select files').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([TEST_IMAGE]);

    // Wait for file to appear in list
    await expect(page.getByText('test-img.png')).toBeVisible();

    // Start upload
    await page.getByRole('button', { name: 'Upload Files', exact: true }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Success message should be visible
    await expect(page.getByText('Files uploaded successfully!')).toBeVisible();

    // URL count should be displayed
    await expect(page.getByText('URL 1:')).toBeVisible();
  });

  test('shows error message on page for oversized files and keeps dialog open', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Files' }).click();
    
    const largeFile = {
      name: 'large-image.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(6 * 1024 * 1024) // 6MB, exceeds 5MB limit
    };

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drag & drop files here, or click to select files').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([largeFile]);

    // Error should appear on the page
    await expect(page.getByText('large-image.jpg is too large. Maximum size is 5MB')).toBeVisible();
    // Dialog should still be open
    await expect(page.getByRole('dialog')).toBeVisible();
  });
  
  test('handles upload failure, shows error on page, and keeps dialog open', async ({ page }) => {
    // Mock failed upload
    await page.route('/api/upload', route => route.fulfill({ status: 500 }));

    await page.getByRole('button', { name: 'Upload Files' }).click();
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drag & drop files here, or click to select files').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([TEST_IMAGE]);

    // Wait for file to appear
    await expect(page.getByText('test-img.png')).toBeVisible();

    // Start upload
    await page.getByRole('button', { name: 'Upload Files', exact: true }).click();

    // Check for error state
    await expect(page.getByTestId('upload-error-icon')).toBeVisible();
    
    // Error should appear on page
    await expect(page.getByText('Failed to upload test-img.png')).toBeVisible();
    
    // Dialog should remain open
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('handles cancelling file upload and removes file from list', async ({ page }) => {
    // Mock upload request to never resolve, so we can cancel it
    await page.route('/api/upload', async route => {
      try {
        // Create a never-resolving promise that will be aborted
        await new Promise<void>(() => {
          // This promise never resolves until the request is aborted
        });
      } catch (error: unknown) {
        route.abort();
      }
    });

    await page.getByRole('button', { name: 'Upload Files' }).click();
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drag & drop files here, or click to select files').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([TEST_IMAGE]);

    // Wait for file to appear in list
    await expect(page.getByText('test-img.png')).toBeVisible();

    // Start upload
    await page.getByRole('button', { name: 'Upload Files', exact: true }).click();

    // Click cancel button for the file
    await page.getByTestId('cancel-upload-button-0').click();

    // Verify file is removed from the list
    await expect(page.getByText('test-img.png')).not.toBeVisible();

    // Dialog should still be open
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}); 