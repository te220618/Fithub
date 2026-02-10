import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import petApi from '../services/petApi';
import { useUIStore } from '../stores/uiStore';
import type { PetData, PetType, LockedPetType, BarnResponse } from '../services/petApi';
import '../styles/settings.css';
import '../styles/pet.css';

// ステージに応じたビジュアル（画像がない場合のフォールバック）
const STAGE_VISUALS: Record<number, { emoji: string; bgColor: string }> = {
  1: { emoji: '🥚', bgColor: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' },
  2: { emoji: '🐣', bgColor: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)' },
  3: { emoji: '🐤', bgColor: 'linear-gradient(135deg, #1a1a2e 0%, #533483 100%)' },
};

// 種類に応じたデフォルト絵文字
const PET_TYPE_EMOJIS: Record<string, string> = {
  dragon: '🐉',
  phoenix: '🔥',
  wolf: '🐺',
  cat: '🐱',
  dog: '🐕',
  rabbit: '🐰',
  bear: '🐻',
  lion: '🦁',
  tiger: '🐯',
  default: '🥚',
};

// ムードに応じたエフェクト
const MOOD_EFFECTS: Record<string, { animation: string; message: string }> = {
  '絶好調': { animation: 'bounce-happy', message: '今日も最高だね！一緒にトレーニング！' },
  '元気': { animation: 'bounce-normal', message: 'また会えたね！筋肉痛は大丈夫？' },
  '普通': { animation: 'sway', message: '今日はどうする？運動しようよ' },
  '寂しい': { animation: 'droop', message: '最近会えなくて寂しいな...' },
  '弱っている': { animation: 'sleep', message: '...zzz' },
  '眠そう': { animation: 'sleep', message: 'まだ夢の中みたい...' },
};

// ペット種類の絵文字取得
const getTypeEmoji = (type: PetType | { code: string }) => {
  return PET_TYPE_EMOJIS[type.code] || PET_TYPE_EMOJIS.default;
};

// 背景スタイルを取得するヘルパー関数
const getBackgroundStyle = (pet: PetData): React.CSSProperties => {
  // 1. ペット種類に背景画像がある場合はそれを使用
  if (pet.petType?.backgroundImage) {
    return {
      backgroundImage: `url(${pet.petType.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  // 2. フォールバック: ステージベースのグラデーション
  const stageVisual = STAGE_VISUALS[pet.stage] || STAGE_VISUALS[1];
  return { background: stageVisual.bgColor };
};

// ペット種類用の背景スタイル取得
const getPetTypeBackgroundStyle = (petType: PetType | LockedPetType, stage: number = 1): React.CSSProperties => {
  if (petType.backgroundImage) {
    return {
      backgroundImage: `url(${petType.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const stageVisual = STAGE_VISUALS[stage] || STAGE_VISUALS[1];
  return { background: stageVisual.bgColor };
};

// ペットカード（小屋内のペット一覧用）
function PetCard({ 
  pet, 
  isActive, 
  onActivate, 
  isActivating 
}: { 
  pet: PetData; 
  isActive: boolean;
  onActivate: () => void;
  isActivating: boolean;
}) {
  const stageVisual = STAGE_VISUALS[pet.stage] || STAGE_VISUALS[1];
  
  return (
    <div 
      className={`settings-card pet-barn-card ${isActive ? 'active' : ''}`}
      style={{ 
        borderColor: isActive ? 'var(--gold)' : undefined,
        position: 'relative'
      }}
    >
      {isActive && (
        <div className="pet-active-badge">アクティブ</div>
      )}
      
      <div className="pet-card-visual" style={getBackgroundStyle(pet)}>
        {pet.imageUrl ? (
          <img src={pet.imageUrl} alt={pet.name} className="pet-card-image" />
        ) : (
          <span className="pet-card-emoji">
            {pet.petType ? getTypeEmoji(pet.petType) : stageVisual.emoji}
          </span>
        )}
      </div>
      
      <div className="pet-card-info">
        <h3 className="pet-card-name">{pet.name}</h3>
        {pet.petType && <span className="pet-card-type">{pet.petType.name}</span>}
        <div className="pet-card-stats">
          <span className="pet-card-level">Lv.{pet.level}</span>
          <span className={`pet-card-stage stage-${pet.stage}`}>{pet.stageName}</span>
        </div>
        <div className="pet-card-exp">
          <div className="pet-card-exp-bar">
            <div 
              className="pet-card-exp-fill" 
              style={{ width: `${Math.round(pet.levelProgress * 100)}%` }} 
            />
          </div>
        </div>
      </div>
      
      {!isActive && (
        <button 
          className="pet-card-activate-btn"
          onClick={onActivate}
          disabled={isActivating}
        >
          {isActivating ? '切替中...' : 'パートナーにする'}
        </button>
      )}
    </div>
  );
}

// 新しいペット入手カード
function NewPetCard({
  petType,
  onSelect,
  isCreating
}: {
  petType: PetType;
  onSelect: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="settings-card pet-barn-card new-pet-card">
      <div className="pet-card-visual" style={getPetTypeBackgroundStyle(petType, 1)}>
        {petType.imageEgg ? (
          <img src={petType.imageEgg} alt={petType.name} className="pet-card-image" />
        ) : (
          <span className="pet-card-emoji">{getTypeEmoji(petType)}</span>
        )}
      </div>
      
      <div className="pet-card-info">
        <h3 className="pet-card-name">{petType.name}</h3>
        {petType.description && (
          <p className="pet-card-desc">{petType.description}</p>
        )}
        <span className="pet-unlock-badge unlocked">入手可能</span>
      </div>
      
      <button 
        className="pet-card-get-btn"
        onClick={onSelect}
        disabled={isCreating}
      >
        {isCreating ? '入手中...' : '卵を入手'}
      </button>
    </div>
  );
}

// 未解放ペットカード
function LockedPetCard({ lockedType }: { lockedType: LockedPetType }) {
  return (
    <div className="settings-card pet-barn-card locked-pet-card">
      <div className="pet-card-visual locked" style={getPetTypeBackgroundStyle(lockedType, 1)}>
        {lockedType.imageEgg ? (
          <img 
            src={lockedType.imageEgg} 
            alt={lockedType.name} 
            className="pet-card-image locked-image" 
          />
        ) : (
          <span className="pet-card-emoji locked-emoji">?</span>
        )}
        <div className="locked-overlay">🔒</div>
      </div>
      
      <div className="pet-card-info">
        <h3 className="pet-card-name">{lockedType.name}</h3>
        <span className="pet-unlock-badge locked">{lockedType.unlockProgress}</span>
      </div>
    </div>
  );
}

// アクティブペット詳細表示
function ActivePetDetail({ 
  pet,
  onDeactivate,
  isDeactivating
}: { 
  pet: PetData;
  onDeactivate: () => void;
  isDeactivating: boolean;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const { petAnimation } = useUIStore();

  const updateMutation = useMutation({
    mutationFn: (name: string) => petApi.updatePetById(pet.id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      queryClient.invalidateQueries({ queryKey: ['pet'] });
      setIsEditing(false);
    },
  });

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      updateMutation.mutate(newName.trim());
    }
  };

  const handleStartEditing = () => {
    setNewName(pet.name || '');
    setIsEditing(true);
  };

  const stageVisual = STAGE_VISUALS[pet.stage] || STAGE_VISUALS[1];
  const moodEffect = MOOD_EFFECTS[pet.moodLabel] || MOOD_EFFECTS['普通'];
  const shouldAnimate = petAnimation && pet.stage !== 1;
  const speechMessage = pet.stage === 1 ? 'Zzzz....' : moodEffect.message;

  const getPetEmoji = () => {
    if (pet.imageUrl) return null;
    if (pet.petType?.code) {
      return PET_TYPE_EMOJIS[pet.petType.code] || stageVisual.emoji;
    }
    return stageVisual.emoji;
  };

  return (
    <div className="active-pet-section">
      <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* 左カラム: ビジュアル */}
        <div className="left-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section className="pet-visual-section settings-card" style={{ ...getBackgroundStyle(pet), border: 'none' }}>
            <div className={`pet-sprite ${shouldAnimate ? moodEffect.animation : ''}`}>
              {pet.imageUrl ? (
                <img src={pet.imageUrl} alt={pet.name} className="pet-image" />
              ) : (
                <span className="pet-emoji">{getPetEmoji()}</span>
              )}
            </div>
            <div className="pet-speech-bubble">
              <p>{speechMessage}</p>
            </div>
          </section>

          <section className="pet-info-card settings-card">
            <div className="pet-header" style={{ marginBottom: '1rem' }}>
              {isEditing ? (
                <form onSubmit={handleNameSubmit} className="pet-name-form">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="名前を入力"
                    maxLength={50}
                    autoFocus
                    className="settings-select"
                    style={{ background: 'var(--bg-color)' }}
                  />
                  <button type="submit" disabled={!newName.trim() || updateMutation.isPending}>
                    保存
                  </button>
                  <button type="button" onClick={() => setIsEditing(false)}>
                    キャンセル
                  </button>
                </form>
              ) : (
                <div className="pet-name-display">
                  <h1 style={{ color: 'var(--gold)', textShadow: 'none' }}>{pet.name || '名前をつけよう'}</h1>
                  <button className="edit-btn" onClick={handleStartEditing} title="名前を変更">
                    ✏️
                  </button>
                </div>
              )}
              {pet.petType && (
                <span className="pet-type-badge">{pet.petType.name}</span>
              )}
            </div>

            <div className="pet-stats">
              <div className="stat-row">
                <span className="stat-label">ステージ</span>
                <span className={`stat-value stage-badge stage-${pet.stage}`}>{pet.stageName}</span>
              </div>

              <div className="stat-row">
                <span className="stat-label">レベル</span>
                <span className="stat-value level-value">Lv. {pet.level}</span>
              </div>

              <div className="stat-row exp-row">
                <span className="stat-label">経験値</span>
                <div className="exp-bar-container">
                  <div className="exp-bar">
                    <div
                      className="exp-bar-fill"
                      style={{ width: `${Math.round(pet.levelProgress * 100)}%` }}
                    />
                  </div>
                  <span className="exp-text">
                    {pet.totalExp.toLocaleString()} EXP
                    <span className="exp-next">（次まで {pet.expToNextLevel.toLocaleString()}）</span>
                  </span>
                </div>
              </div>

              <div className="stat-row">
                <span className="stat-label">元気度</span>
                <div className="mood-container">
                  <div className="mood-bar">
                    <div
                      className={`mood-bar-fill mood-${pet.moodLabel}`}
                      style={{ width: `${pet.moodScore}%` }}
                    />
                  </div>
                  <span className={`mood-label mood-${pet.moodLabel}`}>{pet.moodLabel}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 右カラム: ガイド */}
        <div className="right-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section className="pet-evolution-guide settings-card">
            <div className="settings-card-header">
              <span className="settings-card-icon">📈</span>
              <h2 className="settings-card-title">進化について</h2>
            </div>
            
            <div className="evolution-stages">
              <div className={`evolution-stage stage-1 ${pet.stage >= 1 ? 'active' : ''} ${pet.stage === 1 ? 'current' : ''}`}>
                {pet.petType?.imageEgg ? (
                  <img src={pet.petType.imageEgg} alt="卵" className="stage-image" />
                ) : (
                  <span className="stage-emoji">{STAGE_VISUALS[1].emoji}</span>
                )}
                <span className="stage-name">卵</span>
                <span className="stage-level">Lv.1-10</span>
              </div>
              <div className="evolution-arrow">→</div>
              <div className={`evolution-stage stage-2 ${pet.stage >= 2 ? 'active' : ''} ${pet.stage === 2 ? 'current' : ''}`}>
                {pet.petType?.imageChild ? (
                  <img src={pet.petType.imageChild} alt="成長期" className="stage-image" />
                ) : (
                  <span className="stage-emoji">{STAGE_VISUALS[2].emoji}</span>
                )}
                <span className="stage-name">成長期</span>
                <span className="stage-level">Lv.11-30</span>
              </div>
              <div className="evolution-arrow">→</div>
              <div className={`evolution-stage stage-3 ${pet.stage >= 3 ? 'active' : ''} ${pet.stage === 3 ? 'current' : ''}`}>
                {pet.petType?.imageAdult ? (
                  <img src={pet.petType.imageAdult} alt="覚醒" className="stage-image" />
                ) : (
                  <span className="stage-emoji">{STAGE_VISUALS[3].emoji}</span>
                )}
                <span className="stage-name">覚醒</span>
                <span className="stage-level">Lv.31+</span>
              </div>
            </div>
            <p className="evolution-hint">
              トレーニングを続けてレベルを上げると、パートナーが進化します！
            </p>
          </section>

          <section className="pet-mood-guide settings-card">
            <div className="settings-card-header">
              <span className="settings-card-icon">❤️</span>
              <h2 className="settings-card-title">元気度について</h2>
            </div>
            
            <p>
              パートナーの元気度は、あなたのトレーニング頻度によって変化します。
              定期的にトレーニングを記録して、パートナーを元気にしてあげましょう！
            </p>
          </section>

          <section className="pet-release-section settings-card">
            <button
              className="pet-release-btn"
              onClick={onDeactivate}
              disabled={isDeactivating}
              style={{ width: '100%', maxWidth: '300px' }}
            >
              {isDeactivating ? '処理中...' : '小屋に戻す'}
            </button>
            <p className="pet-release-hint">
              別のパートナーと一緒にトレーニングしたい場合はこちら
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

// 小屋メイン画面
function BarnView({ barnData }: { barnData: BarnResponse }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'owned' | 'available' | 'locked'>('owned');
  const [creatingTypeId, setCreatingTypeId] = useState<number | null>(null);

  const activateMutation = useMutation({
    mutationFn: petApi.activatePet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      queryClient.invalidateQueries({ queryKey: ['pet'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: petApi.deletePet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      queryClient.invalidateQueries({ queryKey: ['pet'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: petApi.createPet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      queryClient.invalidateQueries({ queryKey: ['pet'] });
      setCreatingTypeId(null);
    },
    onError: () => {
      setCreatingTypeId(null);
    },
  });

  const handleCreatePet = (petTypeId: number) => {
    setCreatingTypeId(petTypeId);
    createMutation.mutate({ petTypeId });
  };

  const { activePet, ownedPets, unlockedTypes, lockedTypes } = barnData;

  return (
    <div className="settings-page">
      <section className="card">
        <h2 className="title">パートナー小屋</h2>
        <p className="subtitle">あなたのパートナーたちを管理します</p>
      </section>

      {/* アクティブペットセクション */}
      {activePet && (
        <div style={{ marginBottom: '1rem' }}>
          <h2 className="barn-section-title">現在のパートナー</h2>
          <ActivePetDetail 
            pet={activePet}
            onDeactivate={() => deactivateMutation.mutate()}
            isDeactivating={deactivateMutation.isPending}
          />
        </div>
      )}

      {/* パートナー小屋カード */}
      <section className="settings-card barn-card">
        {/* タブナビゲーション */}
        <div className="barn-tabs">
          <button 
            className={`barn-tab ${activeTab === 'owned' ? 'active' : ''}`}
            onClick={() => setActiveTab('owned')}
          >
            所持中 ({ownedPets.length})
          </button>
          <button 
            className={`barn-tab ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            入手可能 ({unlockedTypes.length})
          </button>
          <button 
            className={`barn-tab ${activeTab === 'locked' ? 'active' : ''}`}
            onClick={() => setActiveTab('locked')}
          >
            未解放 ({lockedTypes.length})
          </button>
        </div>

        {/* タブコンテンツ */}
        <div className="barn-content">
          {activeTab === 'owned' && (
            <div className="barn-grid">
              {ownedPets.length === 0 ? (
                <div className="barn-empty">
                  <p>まだパートナーがいません</p>
                  <p className="barn-empty-hint">「入手可能」タブから新しいパートナーを迎えましょう</p>
                </div>
              ) : (
                ownedPets.map(pet => (
                  <PetCard
                    key={pet.id}
                    pet={pet}
                    isActive={pet.isActive}
                    onActivate={() => activateMutation.mutate(pet.id)}
                    isActivating={activateMutation.isPending}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'available' && (
            <div className="barn-grid">
              {unlockedTypes.length === 0 ? (
                <div className="barn-empty">
                  <p>入手可能なパートナーはいません</p>
                  <p className="barn-empty-hint">レベルを上げたり、ペットを育てて新しい種類を解放しましょう</p>
                </div>
              ) : (
                unlockedTypes.map(type => (
                  <NewPetCard
                    key={type.id}
                    petType={type}
                    onSelect={() => handleCreatePet(type.id)}
                    isCreating={creatingTypeId === type.id}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'locked' && (
            <div className="barn-grid">
              {lockedTypes.length === 0 ? (
                <div className="barn-empty">
                  <p>全てのパートナーが解放済みです！</p>
                </div>
              ) : (
                lockedTypes.map(type => (
                  <LockedPetCard key={type.id} lockedType={type} />
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {createMutation.isError && (
        <div className="pet-create-error">
          <p>パートナーの入手に失敗しました。もう一度お試しください。</p>
        </div>
      )}
    </div>
  );
}

// 初回ペット選択画面（ペットが一匹もいない場合）
function InitialPetSelection({ 
  petTypes, 
  onSelect, 
  isCreating 
}: {
  petTypes: PetType[];
  onSelect: (petTypeId: number) => void;
  isCreating: boolean;
}) {
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const starterTypes = petTypes.filter(pt => pt.isStarter);
  const selectedPetType = starterTypes.find(pt => pt.id === selectedType);

  const handleCreate = () => {
    if (selectedType !== null) {
      onSelect(selectedType);
    }
  };

  return (
    <div className="settings-page">
      <section className="card">
        <h2 className="title">パートナーを選ぼう</h2>
        <p className="subtitle">一緒にトレーニングを頑張るパートナーを選んでください</p>
      </section>

      {starterTypes.length === 0 ? (
        <div className="settings-card pet-selection-empty">
          <div className="empty-icon">🥚</div>
          <h2>準備中</h2>
          <p>選択可能なパートナーがまだ登録されていません</p>
        </div>
      ) : (
        <>
          <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {starterTypes.map((type) => {
              const isSelected = selectedType === type.id;
              
              return (
                <button
                  key={type.id}
                  className={`settings-card pet-type-card-enhanced ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedType(type.id)}
                  disabled={isCreating}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    textAlign: 'center',
                    borderColor: isSelected ? 'var(--gold)' : undefined,
                    backgroundColor: isSelected ? 'rgba(255, 215, 0, 0.1)' : undefined
                  }}
                >
                  <div className="pet-type-visual" style={getPetTypeBackgroundStyle(type, 1)}>
                    {type.imageEgg ? (
                      <img src={type.imageEgg} alt={type.name} className="pet-type-image" />
                    ) : (
                      <span className="pet-type-emoji">{getTypeEmoji(type)}</span>
                    )}
                  </div>
                  <div className="pet-type-info">
                    <span className="pet-type-name" style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>{type.name}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedPetType && (
            <div className="settings-card" style={{ marginTop: '2rem', borderColor: 'var(--gold)' }}>
              <div className="settings-card-header">
                <span className="settings-card-icon">✨</span>
                <h2 className="settings-card-title">選択中のパートナー: {selectedPetType.name}</h2>
              </div>
              
              <div className="pet-selection-preview" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                <div className="preview-visual" style={{ width: '120px', height: '120px' }}>
                  {selectedPetType.imageEgg ? (
                    <img src={selectedPetType.imageEgg} alt={selectedPetType.name} style={{ maxWidth: '100px', maxHeight: '100px' }} />
                  ) : (
                    <span className="preview-emoji" style={{ fontSize: '5rem' }}>{getTypeEmoji(selectedPetType)}</span>
                  )}
                </div>
                <div className="preview-info">
                  {selectedPetType.description ? (
                    <p className="preview-description" style={{ fontSize: '1rem', lineHeight: '1.6' }}>
                      {selectedPetType.description}
                    </p>
                  ) : (
                    <p className="preview-description">
                      このパートナーと一緒にトレーニングを始めましょう！
                    </p>
                  )}
                </div>
              </div>

              <div className="pet-selection-footer" style={{ marginTop: '1.5rem' }}>
                <button
                  className="settings-save-btn"
                  onClick={handleCreate}
                  disabled={isCreating}
                  style={{ maxWidth: '300px' }}
                >
                  {isCreating ? 'パートナーを呼び出し中...' : 'このパートナーを選ぶ'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


export default function Pet() {
  const queryClient = useQueryClient();

  // 小屋情報取得
  const { data: barnData, isLoading: isBarnLoading, error: barnError } = useQuery({
    queryKey: ['barn'],
    queryFn: petApi.getBarn,
  });

  // ペット種類一覧取得（ペットがない場合のみ）
  const { data: petTypes = [], isLoading: isTypesLoading } = useQuery({
    queryKey: ['petTypes'],
    queryFn: petApi.getPetTypes,
    enabled: barnData?.ownedPets.length === 0,
  });

  // ペット作成ミューテーション
  const createMutation = useMutation({
    mutationFn: petApi.createPet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      queryClient.invalidateQueries({ queryKey: ['pet'] });
    },
  });

  const handleCreatePet = (petTypeId: number) => {
    createMutation.mutate({ petTypeId });
  };

  // ローディング
  if (isBarnLoading) {
    return (
      <div className="pet-page">
        <div className="pet-loading">
          <div className="loading-spinner" />
          <p>小屋を読み込み中...</p>
        </div>
      </div>
    );
  }

  // エラー
  if (barnError) {
    return (
      <div className="pet-page">
        <div className="pet-error">
          <p>小屋情報の取得に失敗しました</p>
        </div>
      </div>
    );
  }

  // ペットが一匹もいない場合 → 初回選択画面
  if (barnData && barnData.ownedPets.length === 0) {
    if (isTypesLoading) {
      return (
        <div className="pet-page">
          <div className="pet-loading">
            <div className="loading-spinner" />
            <p>パートナー候補を読み込み中...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="pet-page">
        <InitialPetSelection
          petTypes={petTypes}
          onSelect={handleCreatePet}
          isCreating={createMutation.isPending}
        />
        {createMutation.isError && (
          <div className="pet-create-error">
            <p>パートナーの作成に失敗しました。もう一度お試しください。</p>
          </div>
        )}
      </div>
    );
  }

  // 小屋画面
  if (barnData) {
    return (
      <div className="pet-page">
        <BarnView barnData={barnData} />
      </div>
    );
  }

  return null;
}
