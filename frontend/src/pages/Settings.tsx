import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import streakApi from '../services/streakApi';
import { useUIStore } from '../stores/uiStore';
import { navItems, isDeveloper, isSpecialAdmin, type NavItem } from '../config/navItems';
import { useAuthStore } from '../stores/authStore';
import '../styles/settings.css';

// ドラッグ可能なアイテムコンポーネント
function SortableNavItem({
    item,
    isHidden,
    isSettings,
    onToggleVisibility,
}: {
    item: NavItem;
    isHidden: boolean;
    isSettings: boolean;
    onToggleVisibility: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.to });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : isHidden ? 0.6 : 1,
        zIndex: isDragging ? 1000 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`nav-setting-item ${isDragging ? 'dragging' : ''}`}
            {...attributes}
            {...listeners}
        >
            <span
                className="nav-drag-handle"
                aria-hidden="true"
            >
                ⠿
            </span>

            <img src={item.iconSrc} alt="" className="nav-item-icon" />
            <span className="nav-item-label">{item.label}</span>

            {/* Visibility Toggle */}
            <label className="nav-visibility-toggle">
                <input
                    type="checkbox"
                    className="nav-visibility-chk"
                    checked={!isHidden}
                    onChange={onToggleVisibility}
                    disabled={isSettings}
                />
                <span className="nav-visibility-slider"></span>
            </label>
        </div>
    );
}

export default function Settings() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const {
        showToast,
        navOrder,
        setNavOrder,
        hiddenNavItems,
        toggleNavVisibility,
        resetNavSettings,
        iconAnimation,
        toggleIconAnimation,
        petAnimation,
        togglePetAnimation,
    } = useUIStore();

    const [graceDays, setGraceDays] = useState(1);
    const [localNavOrder, setLocalNavOrder] = useState<string[]>([]);

    // dnd-kit センサー設定（PC + モバイル対応）
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10, // 10px動いたらドラッグ開始 (マウス用)
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 500, // 500ms(0.5秒)長押しでドラッグ開始 (タッチ用)
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 1. ゲーム設定（ストリーク）の取得
    const { data: settingsData } = useQuery({
        queryKey: ['userSettings'],
        queryFn: streakApi.getSettings,
    });

    // 設定がロードされたらStateに反映
    useEffect(() => {
        if (settingsData) {
            setGraceDays(settingsData.graceDaysAllowed);
        }
    }, [settingsData]);

    // ストリーク設定更新Mutation
    const updateSettingsMutation = useMutation({
        mutationFn: (days: number) => streakApi.updateSettings(days),
        onSuccess: (_, variables) => {
            showToast('トレーニング設定を保存しました', 'success');
            queryClient.invalidateQueries({ queryKey: ['userSettings'] });
            // ダッシュボードの表示更新のためストリーク情報も再取得
            queryClient.invalidateQueries({ queryKey: ['streaks'] });
            setGraceDays(variables);
        },
        onError: () => {
            showToast('設定の保存に失敗しました', 'error');
        },
    });

    // 2. ナビゲーション設定の初期化
    // navItemsの全項目を、navOrderの順序でソートしてローカルステートにセット
    useEffect(() => {
        const isDev = isDeveloper(user?.displayName);
        const isAdmin = isSpecialAdmin(user?.loginId);
        const availableItems = navItems.filter(item => {
            if (item.devOnly && !isDev) return false;
            if (item.adminOnly && !isAdmin) return false;
            return true;
        });

        // 現在のnavOrderに含まれていない新しい項目があれば末尾に追加
        const currentOrderSet = new Set(navOrder);
        const newItems = availableItems
            .filter(item => !currentOrderSet.has(item.to))
            .map(item => item.to);

        const fullOrder = [...navOrder, ...newItems]
            .filter(path => availableItems.some(item => item.to === path)); // 存在しないパスを除外

        setLocalNavOrder(fullOrder);
    }, [navOrder, user?.displayName, user?.loginId]);

    // 表示用のアイテムリスト作成
    const getOrderedNavItems = () => {
        const isDev = isDeveloper(user?.displayName);
        const isAdmin = isSpecialAdmin(user?.loginId);
        const availableItems = navItems.filter(item => {
            if (item.devOnly && !isDev) return false;
            if (item.adminOnly && !isAdmin) return false;
            return true;
        });

        return localNavOrder
            .map(path => availableItems.find(item => item.to === path))
            .filter((item): item is typeof navItems[0] => item !== undefined);
    };

    // ドラッグ終了時の処理
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = localNavOrder.indexOf(active.id as string);
            const newIndex = localNavOrder.indexOf(over.id as string);

            const newOrder = arrayMove(localNavOrder, oldIndex, newIndex);
            setLocalNavOrder(newOrder);
            setNavOrder(newOrder);
        }
    };

    const orderedItems = getOrderedNavItems();

    return (
        <div className="settings-page">
            <section className="card">
                <h2 className="title">設定</h2>
                <p className="subtitle">アプリケーションの動作や表示をカスタマイズします</p>
            </section>

            <div className="settings-grid">
                {/* 左カラム */}
                <div className="settings-left-column">
                    {/* カード 1: トレーニング設定 */}
                    <div className="settings-card">
                        <div className="settings-card-header">
                            <span className="settings-card-icon">💪</span>
                            <h2 className="settings-card-title">トレーニング設定</h2>
                        </div>

                        <div className="settings-form-group">
                            <label className="settings-label">中休み許容日数 (Grace Days)</label>
                            <p className="settings-description">
                                ストリーク（連続記録）が途切れるまでに許容される休息日数を設定します。<br />
                                ※無理なく継続するために、週1〜2日の休息をお勧めします。
                            </p>
                            <select
                                className="settings-select"
                                value={graceDays}
                                onChange={(e) => setGraceDays(Number(e.target.value))}
                            >
                                <option value={0}>0日（毎日継続必須）</option>
                                <option value={1}>1日（1日休んでもOK）</option>
                                <option value={2}>2日（2日まで休んでもOK）</option>
                                <option value={3}>3日（3日まで休んでもOK）</option>
                            </select>
                        </div>

                        <button
                            className="settings-save-btn"
                            onClick={() => updateSettingsMutation.mutate(graceDays)}
                            disabled={updateSettingsMutation.isPending || (settingsData && settingsData.graceDaysAllowed === graceDays)}
                        >
                            {updateSettingsMutation.isPending ? '保存中...' : '設定を保存'}
                        </button>
                    </div>

                    {/* カード 2: パフォーマンス設定 */}
                    <div className="settings-card">
                        <div className="settings-card-header">
                            <span className="settings-card-icon">⚡</span>
                            <h2 className="settings-card-title">パフォーマンス設定</h2>
                        </div>

                        <div className="settings-form-group">
                            <label className="settings-toggle-row">
                                <span className="settings-toggle-label">アイコンアニメーション</span>
                                <label className="nav-visibility-toggle">
                                    <input
                                        type="checkbox"
                                        className="nav-visibility-chk"
                                        checked={iconAnimation}
                                        onChange={toggleIconAnimation}
                                    />
                                    <span className="nav-visibility-slider"></span>
                                </label>
                            </label>
                            <p className="settings-description">
                                OFFにするとGPU負荷を軽減できます
                            </p>
                        </div>

                        <div className="settings-form-group">
                            <label className="settings-toggle-row">
                                <span className="settings-toggle-label">パートナーアニメーション</span>
                                <label className="nav-visibility-toggle">
                                    <input
                                        type="checkbox"
                                        className="nav-visibility-chk"
                                        checked={petAnimation}
                                        onChange={togglePetAnimation}
                                    />
                                    <span className="nav-visibility-slider"></span>
                                </label>
                            </label>
                            <p className="settings-description">
                                パートナー画面の揺れアニメーションを無効にします
                            </p>
                        </div>
                    </div>

                    {/* カード 3: お問い合わせ */}
                    <div className="settings-card">
                        <div className="settings-card-header">
                            <span className="settings-card-icon">✉️</span>
                            <h2 className="settings-card-title">お問い合わせ</h2>
                        </div>

                        <div className="settings-form-group">
                            <p className="settings-description">
                                バグ報告や改善要望を送信できます。内容は開発者のみが閲覧します。
                            </p>
                            <button
                                className="settings-save-btn"
                                type="button"
                                onClick={() => navigate('/contact')}
                            >
                                お問い合わせページへ
                            </button>
                        </div>
                    </div>
                </div>

                {/* カード 3: UI/ナビゲーション設定 */}
                <div className="settings-card settings-card-span">
                    <div className="settings-card-header">
                        <span className="settings-card-icon">📱</span>
                        <h2 className="settings-card-title">メニューカスタマイズ</h2>
                    </div>

                    <div className="settings-form-group">
                        <p className="settings-description">
                            サイドバーとボトムナビの表示順序や、表示/非表示をカスタマイズできます。<br />
                            アイテムをドラッグ&ドロップして順序を変更してください。<br />
                            ※「設定」は非表示にできません。
                        </p>

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={localNavOrder}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="nav-settings-list">
                                    {orderedItems.map((item) => {
                                        const isHidden = hiddenNavItems.includes(item.to);
                                        const isSettings = item.to === '/settings';

                                        return (
                                            <SortableNavItem
                                                key={item.to}
                                                item={item}
                                                isHidden={isHidden}
                                                isSettings={isSettings}
                                                onToggleVisibility={() => toggleNavVisibility(item.to)}
                                            />
                                        );
                                    })}
                                </div>
                            </SortableContext>
                        </DndContext>

                        <button className="reset-settings-btn" onClick={resetNavSettings}>
                            デフォルトに戻す
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
