import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupplementsByCategory } from '../services/supplementApi';
import type { Supplement } from '../types/supplement';
import { useEscapeKey } from '../hooks';
import '../styles/supplements.css';

const categoryInfo: Record<string, { title: string; subtitle: string }> = {
  amino: { title: 'アミノ酸系', subtitle: '筋肉の合成と回復をサポート' },
  protein: { title: 'プロテイン系', subtitle: 'タンパク質補給と筋合成促進' },
  vitamin: { title: 'ビタミン・ミネラル系', subtitle: '健康維持とパフォーマンス向上' },
  performance: { title: 'パフォーマンス系', subtitle: '運動能力と筋力の向上' },
  all: { title: '総合ティア', subtitle: 'すべてのサプリメントをS→A→B→C順で表示' }
};

const categoryTabs = [
  { code: 'amino', name: 'アミノ酸系' },
  { code: 'protein', name: 'プロテイン系' },
  { code: 'vitamin', name: 'ビタミン・ミネラル系' },
  { code: 'performance', name: 'パフォーマンス系' },
  { code: 'all', name: '総合ティア' }
];

export default function Supplements() {
  const [currentCategory, setCurrentCategory] = useState('amino');
  const [selectedSupplement, setSelectedSupplement] = useState<Supplement | null>(null);

  const { data: rawSupplements, isLoading, isError, error } = useQuery({
    queryKey: ['supplements', currentCategory],
    queryFn: () => getSupplementsByCategory(currentCategory),
  });

  const supplements = Array.isArray(rawSupplements) ? rawSupplements : [];

  const info = categoryInfo[currentCategory];

  return (
    <div className="container">
      {/* イントロセクション */}
      <section className="card">
        <h2 className="title">サプリメントガイド</h2>
        <p className="subtitle">筋トレに効果的なサプリメントの種別とティア表</p>
      </section>

      {/* カテゴリータブ */}
      <section className="card" style={{ padding: '10px 12px' }}>
        <div className="category-tabs">
          {categoryTabs.map((tab) => (
            <div
              key={tab.code}
              className={`category ${currentCategory === tab.code ? 'active' : ''}`}
              onClick={() => setCurrentCategory(tab.code)}
            >
              {tab.name}
            </div>
          ))}
        </div>
      </section>

      {/* リストセクション */}
      <section className="card" style={{ marginTop: '12px' }}>
        <h3 className="title">{info.title}</h3>
        <p className="subtitle">{info.subtitle}</p>

        <div className={`supp-list ${currentCategory !== 'all' ? 'grid-view' : ''}`}>
          {isLoading ? (
            <div className="loading">データを読み込んでいます...</div>
          ) : isError ? (
            <div className="error">⚠️ {(error as Error).message}</div>
          ) : supplements.length === 0 ? (
            <div className="loading">データがありません</div>
          ) : currentCategory === 'all' ? (
            // 総合ティア: Tierごとにグループ化して表示
            ['S', 'A', 'B', 'C'].map((tier) => {
              const tierSupplements = supplements.filter((s) => s.tier === tier);
              if (tierSupplements.length === 0) return null;

              return (
                <div key={tier} className={`tier-group tier-${tier}`}>
                  <div className="tier-header">
                    <span className={`badge ${tier}`}>{tier}</span>
                    <span className="tier-label">
                      {tier === 'S' ? '効果が高い' : null}
                      {tier === 'A' ? '効果あり' : null}
                      {tier === 'B' ? '補助的に有効' : null}
                      {tier === 'C' ? '限定的な効果' : null}
                    </span>
                  </div>
                  <div className="tier-items">
                    {tierSupplements.map((supp) => (
                      <div
                        key={supp.id}
                        className="tier-item"
                        onClick={() => setSelectedSupplement(supp)}
                      >
                        {supp.name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            // 通常カテゴリ: 従来のリスト表示
            supplements.map((supp) => (
              <div
                key={supp.id}
                className={`supp tier-${supp.tier}`}
                onClick={() => setSelectedSupplement(supp)}
              >
                <div className="row">
                  <span className={`badge ${supp.tier}`}>{supp.tier}</span>
                  
                  <span className="name">{supp.name}</span>
                </div>
                <div className="desc">{supp.description}</div>
              </div>
            ))
          )}
        </div>

        <div className="legend">
          💡 {currentCategory === 'all'
            ? '各サプリメント名をクリックすると詳細情報が表示されます'
            : 'ティアの見方: S = 効果が高い / A = 効果あり / B = 補助的に有効 / C = 限定的な効果'}
        </div>
      </section>

      {/* 詳細モーダル */}
      {selectedSupplement ? (
        <SupplementModal
          supplement={selectedSupplement}
          onClose={() => setSelectedSupplement(null)}
        />
      ) : null}
    </div>
  );
}

function SupplementModal({
  supplement,
  onClose,
}: {
  supplement: Supplement;
  onClose: () => void;
}) {
  // ESCキーで閉じる
  useEscapeKey(onClose);

  // モーダル表示時に背景スクロールを防止
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="supp-modal show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="supp-modal-content">
        <span className="supp-close-modal" onClick={onClose}>&times;</span>
        <div className="supp-modal-header">
          <div className="supp-modal-tier">
            <span className={`badge ${supplement.tier}`}>{supplement.tier}</span> 
          </div>
          <div className="supp-modal-name">{supplement.name}</div>
        </div>
        <p className="supp-modal-desc">{supplement.description}</p>

        <p style={{ fontWeight: 600 }}>💪 主な効果:</p>
        <ul>
          {supplement.effects && supplement.effects.length > 0 ? (
            supplement.effects.map((effect) => (
              <li key={effect.id}>{effect.effect_text}</li>
            ))
          ) : (
            <li>効果の情報がありません</li>
          )}
        </ul>

        <div className="supp-modal-cards">
          <div className="supp-info-card">
            📊 <strong>摂取量</strong><br />
            <span>{supplement.dosage || '未設定'}</span>
          </div>
          <div className="supp-info-card">
            ⏰ <strong>タイミング</strong><br />
            <span>{supplement.timing || '未設定'}</span>
          </div>
        </div>

        <div className="supp-advice-card">
          💡 <strong>アドバイス:</strong><br />
          <span>{supplement.advice || 'アドバイスがありません'}</span>
        </div>

        {supplement.links && supplement.links.length > 0 && (
          <div className="supp-purchase-links">
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>🛒 購入リンク:</p>
            <div className="supp-link-buttons">
              {supplement.links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`supp-link-btn ${link.site_type || 'other'}`}
                >
                  <span className="site-label">{getSiteLabel(link.site_type)}</span>
                  <span className="link-desc">{link.description || 'リンク'}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getSiteLabel(siteType?: string): string {
  switch (siteType) {
    case 'amazon': return 'Amazon';
    case 'rakuten': return '楽天';
    case 'yahoo': return 'Yahoo!';
    case 'iherb': return 'iHerb';
    default: return 'Link';
  }
}
