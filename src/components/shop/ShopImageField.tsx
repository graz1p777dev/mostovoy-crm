'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImageOff, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadShopImage } from '@/actions/mostovoy-products'

/** Пути витрины (/uploads/..., /images/...) для превью надо дополнить её доменом. */
export function absoluteShopImage(url: string, imageBase: string): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${imageBase}${url.startsWith('/') ? '' : '/'}${url}`
}

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  imageBase: string
  hint?: string
}

/**
 * Фото: либо внешний URL, либо файл. Файл уходит на витрину через Server Action
 * (её /api/admin/upload требует админ-токен), в ответ приходит /uploads/*.webp —
 * его и подставляем в поле.
 */
export function ShopImageField({ label, value, onChange, imageBase, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [broken, setBroken] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const result = await uploadShopImage(formData)
    setUploading(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setBroken(false)
    onChange(result.data?.url ?? '')
    toast.success('Фото загружено')
  }

  const preview = value ? absoluteShopImage(value, imageBase) : ''

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
          {preview && !broken ? (
            // Домен витрины не в next.config.ts images.remotePatterns, поэтому
            // обычный <img>, а не next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <ImageOff size={16} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => { setBroken(false); onChange(e.target.value) }}
              placeholder="https://… или /uploads/файл.webp"
              className="h-9"
            />
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => { setBroken(false); onChange('') }}
                title="Убрать фото"
              >
                <X size={14} />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-shrink-0"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span className="ml-1.5 hidden sm:inline">Файл</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {hint ?? 'Витрина проверяет ссылку перед сохранением: недоступное фото она не примет.'}
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}
