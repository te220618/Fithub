import { useState } from 'react';
import type { MuscleGroup } from '../../types';

interface CustomExerciseModalProps {
  muscleGroups: MuscleGroup[];
  onClose: () => void;
  onSave: (name: string, muscleGroupId: number) => void;
  isLoading: boolean;
}

export default function CustomExerciseModal({
  muscleGroups,
  onClose,
  onSave,
  isLoading,
}: CustomExerciseModalProps) {
  const [name, setName] = useState('');
  const [muscleGroupId, setMuscleGroupId] = useState<number>(muscleGroups[0]?.id || 0);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), muscleGroupId);
  };

  return (
    <div className="modal-overlay active" id="customExerciseModal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">オリジナル種目を作成</h3>
          <button className="modal-close" id="closeCustomModal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">種目名</label>
            <input
              type="text"
              className="form-input"
              id="customNameInput"
              placeholder="例: ヒップスラスト"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">部位</label>
            <select
              className="form-input"
              id="customMuscleInput"
              value={muscleGroupId}
              onChange={(e) => setMuscleGroupId(parseInt(e.target.value))}
            >
              {muscleGroups.map((mg) => (
                <option key={mg.id} value={mg.id}>{mg.displayName}</option>
              ))}
            </select>
          </div>
          <button
            className="btn-save"
            id="btnSaveCustom"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={isLoading}
          >
            作成する
          </button>
        </div>
      </div>
    </div>
  );
}
