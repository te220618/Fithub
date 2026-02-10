import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGearCategories, getGearTypesByCategory } from '../services/gearApi';
import type { GearCategory, GearType } from '../types/gear';
import { useEscapeKey } from '../hooks';
import '../styles/gear.css';

export default function Gear() {
  const [selectedCategory, setSelectedCategory] = useState<GearCategory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // カテゴリ一覧取得
  const { data: rawCategories, isLoading: isCategoriesLoading } = useQuery({
    queryKey: ['gearCategories'],
    queryFn: getGearCategories,
  });

  const categories = Array.isArray(rawCategories) ? rawCategories : [];

  // 選択したカテゴリのギアタイプを取得
  const { data: rawGearTypes, isLoading: isTypesLoading } = useQuery({
    queryKey: ['gearTypes', selectedCategory?.id],
    queryFn: () => (selectedCategory ? getGearTypesByCategory(selectedCategory.id) : Promise.resolve([])),
    enabled: !!selectedCategory,
  });

  const gearTypes = Array.isArray(rawGearTypes) ? rawGearTypes : [];

  const openModal = (category: GearCategory) => {
    setSelectedCategory(category);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="container">
      {/* イントロセクション */}
      <section className="card">
        <h2 className="title">トレーニングギアガイド</h2>
        <p className="subtitle">効果的なトレーニングをサポートする各種ギアの特徴と選び方</p>
      </section>

      {/* ギアグリッド */}
      <section className="gear-grid">
        {isCategoriesLoading ? (
          <div className="loading">読み込み中...</div>
        ) : (
          categories.map((category) => (
            <div
              key={category.id}
              className="gear-card"
              onClick={() => openModal(category)}
            >
              <div
                className="gear-icon-mask"
                style={{
                  '--icon-url': `url('${category.iconPath || '/images/gear_default.webp'}')`,
                  '--icon-color': category.iconColor || '#FFD700',
                } as React.CSSProperties}
              />
              <div className="gear-name">{category.name}</div>
              <div className="gear-desc">{category.description || 'コメント未設定'}</div>
              <div className="gear-info">{category.typeCount || 0}種類のタイプを紹介</div>
            </div>
          ))
        )}
      </section>

      {/* ヒントセクション */}
      <section className="hint-section">
        <svg className="hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div className="hint-text">
          <strong>選び方のヒント:</strong> 初心者は安価なタイプから始め、トレーニングレベルが上がるにつれて高性能なギアに移行するのがおすすめです
        </div>
      </section>

      {/* モーダル */}
      {isModalOpen && selectedCategory ? (
        <GearModal
          category={selectedCategory}
          gearTypes={gearTypes}
          isLoading={isTypesLoading}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

function GearModal({
  category,
  gearTypes,
  isLoading,
  onClose,
}: {
  category: GearCategory;
  gearTypes: GearType[];
  isLoading: boolean;
  onClose: () => void;
}) {
  // ESCキーで閉じる
  useEscapeKey(onClose);

  return (
    <div className="gear-modal show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gear-modal-content">
        <div className="gear-modal-header">
          <h2 id="modalTitle">
            <span
              className="gear-icon-mask"
              style={{
                '--icon-url': `url('${category.iconPath || '/images/gear_default.webp'}')`,
                '--icon-color': category.iconColor || '#FFD700',
                width: '28px',
                height: '28px',
              } as React.CSSProperties}
            />
            {category.name}
          </h2>
          <span className="gear-close" onClick={onClose}>&times;</span>
        </div>
        <div className="gear-modal-body">
          {isLoading ? (
            <div className="loading">読み込み中...</div>
          ) : gearTypes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>データがありません</p>
          ) : (
            gearTypes.map((type) => (
              <div key={type.id} className="type-section">
                <div className="type-header">
                  <div className="type-name">{type.name}</div>
                  <div className="type-price">{type.priceRange}</div>
                </div>
                <div className="features-container">
                  <div className="feature-list">
                    <div className="feature-title merit">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                      </svg>
                      メリット
                    </div>
                    {type.merits.map((merit, index) => (
                      <div key={index} className="feature-item">{merit}</div>
                    ))}
                  </div>
                  <div className="feature-list">
                    <div className="feature-title demerit">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      デメリット
                    </div>
                    {type.demerits.map((demerit, index) => (
                      <div key={index} className="feature-item">{demerit}</div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
