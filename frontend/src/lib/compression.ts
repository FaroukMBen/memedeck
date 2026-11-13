/**
 * Client-Side Media Compression Utility
 * Resizes and compresses image assets to modern WebP format before network transmission.
 * Preserves videos and animated GIFs.
 */

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
}

export async function compressImageClientSide(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.80
): Promise<CompressionResult> {
  // If not a static image (e.g. video or gif), do not transcode with canvas
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      savingsPercent: 0,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => {
      resolve({
        file,
        originalSize: file.size,
        compressedSize: file.size,
        savingsPercent: 0,
      });
    };

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        resolve({
          file,
          originalSize: file.size,
          compressedSize: file.size,
          savingsPercent: 0,
        });
      };

      img.onload = () => {
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        // Resize proportionally if exceeds max bounds
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({
            file,
            originalSize: file.size,
            compressedSize: file.size,
            savingsPercent: 0,
          });
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // If compressed size is not smaller, keep original
              return resolve({
                file,
                originalSize: file.size,
                compressedSize: file.size,
                savingsPercent: 0,
              });
            }

            const baseName = file.name.replace(/\.[^/.]+$/, '');
            const newFile = new File([blob], `${baseName}.webp`, {
              type: 'image/webp',
              lastModified: Date.now(),
            });

            const savings = Math.round(((file.size - blob.size) / file.size) * 100);

            resolve({
              file: newFile,
              originalSize: file.size,
              compressedSize: blob.size,
              savingsPercent: Math.max(0, savings),
            });
          },
          'image/webp',
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

