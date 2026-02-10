import { useState, useEffect, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import type { Gym } from '../types';
import { getPublicConfig } from '../services/configApi';

interface GymMapProps {
  gyms: Gym[];
  selectedTags: string[];
}

// 仙台駅の座標（フォールバック用）
const SENDAI_STATION = { lat: 38.2601, lng: 140.8821 };

export default function GymMap({ gyms, selectedTags }: GymMapProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [mapCenter, setMapCenter] = useState(SENDAI_STATION);
  const [apiKey, setApiKey] = useState<string | undefined>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  );
  const [configChecked, setConfigChecked] = useState(false);

  // 現在地取得
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          setMapCenter(loc);
        },
        () => {
          // 位置情報が取得できない場合は仙台駅を使用
          setMapCenter(SENDAI_STATION);
        }
      );
    }
  }, []);

  const handleMarkerClick = useCallback((gym: Gym) => {
    setSelectedGym(gym);
  }, []);

  useEffect(() => {
    if (apiKey || configChecked) return;

    let active = true;
    getPublicConfig()
      .then((config) => {
        if (!active) return;
        if (config.googleMapsApiKey) {
          setApiKey(config.googleMapsApiKey);
        }
      })
      .finally(() => {
        if (active) {
          setConfigChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, [apiKey, configChecked]);

  if (!apiKey && !configChecked) {
    return (
      <div className="gym-map-error">
        Google Maps APIキーを読み込み中...
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="gym-map-error">
        Google Maps APIキーが設定されていません
      </div>
    );
  }

  // 座標を持つジムのみフィルタリング
  const gymsWithCoords = gyms.filter((gym) => gym.latitude && gym.longitude);

  return (
    <APIProvider apiKey={apiKey}>
      <div className="gym-map-container no-swipe">
        <Map
          defaultCenter={mapCenter}
          defaultZoom={13}
          mapId="gym-search-map"
          gestureHandling="greedy"
          disableDefaultUI={false}
          zoomControl={true}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
          clickableIcons={false}
        >
          {/* 現在地マーカー */}
          {userLocation ? (
            <AdvancedMarker position={userLocation}>
              <div className="current-location-marker">
                <div className="current-location-dot" />
                <div className="current-location-pulse" />
              </div>
            </AdvancedMarker>
          ) : null}

          {/* ジムマーカー */}
          {gymsWithCoords.map((gym) => (
            <AdvancedMarker
              key={gym.id}
              position={{ lat: gym.latitude!, lng: gym.longitude! }}
              onClick={() => handleMarkerClick(gym)}
            >
              <div className="gym-marker">
                <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" className="gym-marker-svg">
                  <path d="M16 0C7.16344 0 0 7.16344 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16344 24.8366 0 16 0Z" fill="#18181b" stroke="#FFD700" strokeWidth="2"/>
                  <circle cx="16" cy="16" r="5" fill="#FFD700"/>
                </svg>
              </div>
            </AdvancedMarker>
          ))}

          {/* ポップアップ */}
          {selectedGym && selectedGym.latitude && selectedGym.longitude ? (
            <InfoWindow
              position={{ lat: selectedGym.latitude, lng: selectedGym.longitude }}
              onCloseClick={() => setSelectedGym(null)}
            >
              <div className="gym-popup">
                <h3 className="gym-popup-name">{selectedGym.name}</h3>
                
                <div className="gym-popup-row">
                  <img src="/images/mapicon.webp" alt="" className="gym-popup-icon" />
                  <span>{selectedGym.address}</span>
                </div>
                
                {selectedGym.openTime || selectedGym.closeTime ? (
                  <div className="gym-popup-row">
                    <img src="/images/watchicon.webp" alt="" className="gym-popup-icon" />
                    <span>{selectedGym.openTime} - {selectedGym.closeTime}</span>
                  </div>
                ) : null}
                
                {selectedGym.monthlyFee ? (
                  <div className="gym-popup-row">
                    <img src="/images/walleticon.webp" alt="" className="gym-popup-icon" />
                    <span>月額 ¥{selectedGym.monthlyFee.toLocaleString()}</span>
                  </div>
                ) : null}
                
                {selectedGym.tags && selectedGym.tags.length > 0 ? (
                  <div className="gym-popup-tags">
                    {selectedGym.tags.map((tag, i) => (
                      <span
                        key={i}
                        className={`gym-popup-tag ${selectedTags.includes(tag) ? 'active' : ''}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </InfoWindow>
          ) : null}
        </Map>
      </div>
    </APIProvider>
  );
}
