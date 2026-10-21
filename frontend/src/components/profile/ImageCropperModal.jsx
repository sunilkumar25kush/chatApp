import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../utils/cropImage';

export default function ImageCropperModal({ imageSrc, onCropComplete, onCancel, aspect = 1 }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteLocal = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    try {
      setIsProcessing(true);
      const croppedImageFile = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedImageFile);
    } catch (e) {
      console.error(e);
      onCancel();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, margin: 20 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onCropComplete={onCropCompleteLocal}
          onZoomChange={setZoom}
        />
      </div>
      <div style={{ padding: 20, background: '#1c1f28', display: 'flex', justifyContent: 'center', gap: 10 }}>
        <input 
          type="range" 
          value={zoom} 
          min={1} 
          max={3} 
          step={0.1} 
          aria-labelledby="Zoom" 
          onChange={(e) => setZoom(e.target.value)} 
          style={{ width: '50%' }}
        />
      </div>
      <div style={{ padding: 20, background: '#181a20', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 4, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={isProcessing} style={{ padding: '8px 16px', borderRadius: 4, background: '#a855f7', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {isProcessing ? 'Processing...' : 'Save Crop'}
        </button>
      </div>
    </div>
  );
}
