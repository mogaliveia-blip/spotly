const MAX_LONG_EDGE = 3200;
const JPEG_QUALITY = 0.86;

export async function compressImageForUpload(file: File): Promise<File> {
  const img = new window.Image();
  const url = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let { width, height } = img;
    const longEdge = Math.max(width, height);

    if (longEdge > MAX_LONG_EDGE) {
      const ratio = MAX_LONG_EDGE / longEdge;
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    ctx?.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value as Blob), 'image/jpeg', JPEG_QUALITY)
    );

    return new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
