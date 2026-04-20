const buildOutputFileName = (fileName: string, outputType: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '')

  if (outputType === 'image/jpeg') {
    return `${baseName}.jpg`
  }

  if (outputType === 'image/png') {
    return `${baseName}.png`
  }

  return fileName
}

const canvasToBlob = (canvas: HTMLCanvasElement, outputType: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), outputType, quality)
  })

export const compressImage = (
  file: File,
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.8,
  maxBytes?: number
): Promise<File> => {
  return new Promise((resolve) => {
    // 若不是圖片，或者是 gif/svg 等不適合被轉換為靜態壓縮圖的格式，直接回傳原檔
    if (!file.type.startsWith('image/') || file.type.includes('gif') || file.type.includes('svg')) {
      return resolve(file)
    }

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // 判斷是否需要按照比例縮小
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        const preferredOutputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const outputTypes = maxBytes && preferredOutputType === 'image/png'
          ? ['image/png', 'image/jpeg']
          : [preferredOutputType]

        let bestCandidate: { blob: Blob; outputType: string } | null = null

        for (const outputType of outputTypes) {
          const supportsQuality = outputType !== 'image/png'
          let nextQuality = Math.min(Math.max(quality, 0.1), 1)
          let blob = await canvasToBlob(canvas, outputType, supportsQuality ? nextQuality : undefined)

          if (!blob) {
            continue
          }

          if (!bestCandidate || blob.size < bestCandidate.blob.size) {
            bestCandidate = { blob, outputType }
          }

          if (maxBytes && supportsQuality) {
            while (blob.size > maxBytes && nextQuality > 0.4) {
              nextQuality = Number((nextQuality - 0.1).toFixed(2))
              const nextBlob = await canvasToBlob(canvas, outputType, nextQuality)
              if (!nextBlob) {
                break
              }

              blob = nextBlob

              if (!bestCandidate || blob.size < bestCandidate.blob.size) {
                bestCandidate = { blob, outputType }
              }
            }
          }

          if (!maxBytes || blob.size <= maxBytes) {
            resolve(new File([blob], buildOutputFileName(file.name, outputType), {
              type: outputType,
              lastModified: Date.now(),
            }))
            return
          }
        }

        if (bestCandidate) {
          resolve(new File([bestCandidate.blob], buildOutputFileName(file.name, bestCandidate.outputType), {
            type: bestCandidate.outputType,
            lastModified: Date.now(),
          }))
          return
        }

        // 若轉換失敗則回傳原檔
        resolve(file)
      }

      // 若載入圖片失敗則回傳原檔
      img.onerror = () => resolve(file)
    }

    reader.onerror = () => resolve(file)
  })
}
