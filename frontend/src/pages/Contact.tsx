import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';
import contactApi, { type ContactRequest, ContactApiError } from '../services/contactApi';
import '../styles/contact.css';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE_COUNT = 4;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

type FormState = {
  kind: ContactRequest['kind'];
  summary: string;
  detail: string;
  reproduction: string;
  contactOk: boolean;
  email: string;
};

type FieldErrors = {
  summary?: string;
  detail?: string;
  reproduction?: string;
};

type ImagePreview = {
  id: string;
  file: File;
  url: string;
};

const initialState: FormState = {
  kind: 'bug',
  summary: '',
  detail: '',
  reproduction: '',
  contactOk: true,
  email: '',
};

/**
 * Resize image to fit within maxSize bytes
 */
async function resizeImage(file: File, maxSize: number): Promise<File> {
  // GIF files cannot be resized (would lose animation)
  if (file.type === 'image/gif') {
    if (file.size > maxSize) {
      throw new Error('GIF画像は2MB以下のファイルを選択してください');
    }
    return file;
  }

  // If already small enough, return as-is
  if (file.size <= maxSize) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // Calculate new dimensions (max 1920px on longest side)
      let { width, height } = img;
      const maxDimension = 1920;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels
      const qualities = [0.85, 0.7, 0.5, 0.3];
      const outputType = 'image/jpeg';

      const tryCompress = (qualityIndex: number) => {
        const quality = qualities[qualityIndex];
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('画像の圧縮に失敗しました'));
              return;
            }

            if (blob.size <= maxSize || qualityIndex >= qualities.length - 1) {
              // Success or last attempt
              const fileName = file.name.replace(/\.[^.]+$/, '.jpg');
              const resizedFile = new File([blob], fileName, { type: outputType });
              resolve(resizedFile);
            } else {
              // Try lower quality
              tryCompress(qualityIndex + 1);
            }
          },
          outputType,
          quality
        );
      };

      tryCompress(0);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };

    img.src = url;
  });
}

export default function Contact() {
  const navigate = useNavigate();
  const { showToast } = useUIStore();
  const [form, setForm] = useState<FormState>(initialState);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const isEmailValid = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  };

  const isValid = useMemo(() => {
    const baseValid = form.summary.trim().length >= 3 && form.detail.trim().length >= 5;
    if (!baseValid) return false;
    if (form.contactOk) {
      return isEmailValid(form.email);
    }
    return true;
  }, [form.contactOk, form.detail, form.email, form.summary]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    // フィールドエラーをクリア
    if (name in fieldErrors) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }

    if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
      const checked = e.target.checked;
      setForm((prev) => ({
        ...prev,
        contactOk: checked,
        email: checked ? prev.email : '',
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
  };

  const processFiles = async (files: File[]) => {
    const remainingSlots = MAX_IMAGE_COUNT - images.length;
    if (remainingSlots <= 0) {
      showToast(`画像は最大${MAX_IMAGE_COUNT}枚までです`, 'error');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    const invalidFiles = filesToProcess.filter((f) => !ALLOWED_TYPES.includes(f.type));

    if (invalidFiles.length > 0) {
      showToast('JPEG、PNG、GIF、WebP形式の画像を選択してください', 'error');
      return;
    }

    setIsProcessingImages(true);

    try {
      const newPreviews: ImagePreview[] = [];

      for (const file of filesToProcess) {
        const resizedFile = await resizeImage(file, MAX_IMAGE_SIZE);
        const url = URL.createObjectURL(resizedFile);
        newPreviews.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: resizedFile,
          url,
        });
      }

      setImages((prev) => [...prev, ...newPreviews]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '画像の処理に失敗しました', 'error');
    } finally {
      setIsProcessingImages(false);
      // Reset input to allow selecting same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const handleImageRemove = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    const payload: ContactRequest = {
      kind: form.kind,
      summary: form.summary.trim(),
      detail: form.detail.trim(),
      reproduction: form.reproduction.trim() || undefined,
      contactOk: form.contactOk,
      email: form.contactOk ? form.email.trim() : undefined,
      pagePath: window.location.pathname,
      userAgent: navigator.userAgent,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
    };

    const imageFiles = images.map((img) => img.file);

    setIsSubmitting(true);
    setFieldErrors({});
    try {
      await contactApi.submit(payload, imageFiles);
      showToast('お問い合わせを送信しました', 'success');
      // Cleanup image URLs
      images.forEach((img) => URL.revokeObjectURL(img.url));
      setForm(initialState);
      setImages([]);
    } catch (error) {
      if (error instanceof ContactApiError && error.field) {
        // フィールド別エラーを設定
        setFieldErrors({ [error.field]: error.message });
      } else {
        showToast('送信に失敗しました。時間をおいて再度お試しください', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <section className="card">
        <h2 className="title">お問い合わせ</h2>
        <p className="subtitle">
          バグや改善要望を送信できます。
        </p>
      </section>

      <section className="contact-card">
        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="contact-field">
            <label className="contact-label" htmlFor="kind">種別</label>
            <select
              id="kind"
              name="kind"
              className="contact-select"
              value={form.kind}
              onChange={handleChange}
            >
              <option value="bug">バグ</option>
              <option value="request">要望</option>
              <option value="other">その他</option>
            </select>
          </div>

          <div className="contact-field">
            <label className="contact-label" htmlFor="summary">概要</label>
            <input
              id="summary"
              name="summary"
              className={`contact-input${fieldErrors.summary ? ' contact-input-error' : ''}`}
              value={form.summary}
              onChange={handleChange}
              placeholder="例: 記録保存ボタンが反応しない"
              required
              maxLength={120}
            />
            <p className="contact-hint">3文字以上120文字以内で入力してください。</p>
            {fieldErrors.summary && (
              <p className="contact-error">{fieldErrors.summary}</p>
            )}
          </div>

          <div className="contact-field">
            <label className="contact-label" htmlFor="detail">詳細</label>
            <textarea
              id="detail"
              name="detail"
              className={`contact-textarea${fieldErrors.detail ? ' contact-input-error' : ''}`}
              value={form.detail}
              onChange={handleChange}
              placeholder="発生状況や期待する挙動を詳しく記載してください"
              required
              rows={6}
              maxLength={3000}
            />
            <p className="contact-hint">5文字以上3000文字以内で入力してください。</p>
            {fieldErrors.detail && (
              <p className="contact-error">{fieldErrors.detail}</p>
            )}
          </div>

          <div className="contact-field">
            <label className="contact-label" htmlFor="reproduction">再現手順 (任意)</label>
            <textarea
              id="reproduction"
              name="reproduction"
              className={`contact-textarea${fieldErrors.reproduction ? ' contact-input-error' : ''}`}
              value={form.reproduction}
              onChange={handleChange}
              placeholder="例: 1) 記録を開く 2) 保存を押す 3) エラーが出る"
              rows={4}
              maxLength={3000}
            />
            {fieldErrors.reproduction && (
              <p className="contact-error">{fieldErrors.reproduction}</p>
            )}
          </div>

          <div className="contact-field">
            <label className="contact-label">スクリーンショット (任意)</label>
            <div
              ref={dropZoneRef}
              className={`contact-images contact-dropzone${isDragging ? ' contact-dropzone-active' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="contact-image-previews">
                {images.map((img) => (
                  <div key={img.id} className="contact-image-preview">
                    <img src={img.url} alt="プレビュー" />
                    <button
                      type="button"
                      className="contact-image-remove"
                      onClick={() => handleImageRemove(img.id)}
                      aria-label="画像を削除"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {images.length < MAX_IMAGE_COUNT && (
                  <label className="contact-image-add">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      onChange={handleImageSelect}
                      disabled={isProcessingImages}
                    />
                    {isProcessingImages ? (
                      <span className="contact-image-add-loading">...</span>
                    ) : (
                      <span className="contact-image-add-icon">+</span>
                    )}
                  </label>
                )}
              </div>
              {images.length === 0 && !isDragging && (
                <p className="contact-dropzone-hint">ここに画像をドラッグ＆ドロップ</p>
              )}
              {isDragging && (
                <p className="contact-dropzone-hint contact-dropzone-hint-active">ドロップして追加</p>
              )}
            </div>
            <p className="contact-hint">最大4枚まで添付できます</p>
          </div>

          <div className="contact-field contact-checkbox-row">
            <label className="contact-checkbox">
              <input
                type="checkbox"
                name="contactOk"
                checked={form.contactOk}
                onChange={handleChange}
              />
              追加の確認連絡を許可する
            </label>
          </div>

          {form.contactOk && (
            <div className="contact-field">
              <label className="contact-label" htmlFor="email">返信用メールアドレス</label>
              <input
                id="email"
                name="email"
                type="email"
                className="contact-input"
                value={form.email}
                onChange={handleChange}
                placeholder="example@example.com"
                required
                maxLength={200}
              />
              <p className="contact-hint">返信が必要な場合は必須です。</p>
            </div>
          )}

          <div className="contact-actions">
            <button
              type="button"
              className="contact-secondary"
              onClick={() => navigate('/settings')}
              disabled={isSubmitting}
            >
              設定へ戻る
            </button>
            <button
              type="submit"
              className="contact-submit"
              disabled={!isValid || isSubmitting || isProcessingImages}
            >
              {isSubmitting ? '送信中...' : '送信する'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
