export const compressImage = (file: File, maxWidth = 1920, maxHeight = 1080, quality = 0.8): Promise<File> => {
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
      img.onload = () => {
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
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          
          // 若原圖是 PNG，則輸出保留 PNG (以防透明背景黑化)；否則預設輸出 JPEG
          const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
          
          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: outputType,
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              // 若轉換失敗則回傳原檔
              resolve(file)
            }
          }, outputType, quality)
        } else {
          resolve(file)
        }
      }
      // 若載入圖片失敗則回傳原檔
      img.onerror = () => resolve(file)
    }
    reader.onerror = () => resolve(file)
  })
}
