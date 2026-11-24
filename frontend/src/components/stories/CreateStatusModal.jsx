import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import storyService from '../../services/storyService';
import ImageCropperModal from '../profile/ImageCropperModal';
import StoryPrivacySelector from './StoryPrivacySelector';
import { toast } from '../../utils/toast';
import './stories.css';

const TEXT_BACKGROUNDS = [
  { id: 'purple', name: 'Royal Purple', value: 'linear-gradient(135deg, #6366f1, #a855f7)' },
  { id: 'sunset', name: 'Sunset Orange', value: 'linear-gradient(135deg, #f97316, #ec4899)' },
  { id: 'emerald', name: 'Emerald', value: 'linear-gradient(135deg, #059669, #10b981)' },
  { id: 'ocean', name: 'Ocean Cyan', value: 'linear-gradient(135deg, #0284c7, #06b6d4)' },
  { id: 'ruby', name: 'Crimson Ruby', value: 'linear-gradient(135deg, #be123c, #f43f5e)' },
  { id: 'midnight', name: 'Midnight', value: 'linear-gradient(135deg, #0f172a, #334155)' }
];

const TEXT_COLORS = [
  { id: 'white', label: 'White', value: '#ffffff' },
  { id: 'amber', label: 'Amber', value: '#fde047' },
  { id: 'cyan', label: 'Cyan', value: '#67e8f9' },
  { id: 'dark', label: 'Dark', value: '#0f172a' }
];

export default function CreateStatusModal({ isOpen, onClose, onStoryCreated }) {
  const [activeTab, setActiveTab] = useState('photo'); // 'photo' | 'video' | 'text'
  const [publishing, setPublishing] = useState(false);

  // Photo Status State
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [isCropping, setIsCropping] = useState(false);
  const photoInputRef = useRef(null);

  // Video Status State
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [videoCaption, setVideoCaption] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const videoInputRef = useRef(null);

  // Text Status State
  const [textContent, setTextContent] = useState('');
  const [textBg, setTextBg] = useState(TEXT_BACKGROUNDS[0].value);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0].value);
  const [textAlign, setTextAlign] = useState('center');

  // Story Privacy State
  const [privacy, setPrivacy] = useState({
    visibility: 'friends',
    allowedViewers: [],
    excludedViewers: []
  });
  const [showPrivacySelector, setShowPrivacySelector] = useState(false);

  // Load user default privacy on open
  useEffect(() => {
    if (!isOpen) return;
    if (typeof storyService.getDefaultPrivacy === 'function') {
      storyService.getDefaultPrivacy()
        .then((res) => {
          if (res?.storyPrivacy) {
            let vis = res.storyPrivacy.visibility || 'friends';
            if (vis === 'custom') vis = 'only_share_with';
            setPrivacy({
              visibility: vis,
              allowedViewers: (res.storyPrivacy.allowedViewers || []).map((u) => u._id || u),
              excludedViewers: (res.storyPrivacy.excludedViewers || []).map((u) => u._id || u)
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Photo Selection
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WEBP, GIF).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image size exceeds 15MB limit.');
      return;
    }

    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  };

  // Handle Video Selection
  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validVideoTypes.includes(file.type)) {
      toast.error('Supported video formats are MP4 and WebM.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video size exceeds 50MB limit.');
      return;
    }

    setVideoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setVideoPreview(objectUrl);
  };

  // Capture Video Metadata
  const handleVideoMetadataLoaded = (e) => {
    const duration = Math.round(e.target.duration || 0);
    setVideoDuration(duration);
    if (duration > 60) {
      toast.info('Video is longer than 60 seconds; only first part will be featured.');
    }
  };

  // Save Crop callback
  const handleCropComplete = (croppedFile) => {
    setPhotoFile(croppedFile);
    const croppedUrl = URL.createObjectURL(croppedFile);
    setPhotoPreview(croppedUrl);
    setIsCropping(false);
  };

  // Publish Status
  const handlePublish = async () => {
    try {
      setPublishing(true);

      if (activeTab === 'photo') {
        if (!photoFile) {
          toast.error('Please select a photo first.');
          return;
        }
        const uploadRes = await storyService.uploadMedia(photoFile);
        await storyService.createStory({
          mediaType: 'photo',
          mediaUrl: uploadRes.url,
          caption: photoCaption,
          duration: 5,
          visibility: privacy.visibility,
          allowedViewers: privacy.allowedViewers,
          excludedViewers: privacy.excludedViewers
        });
        toast.success('Photo Status published!');
      } else if (activeTab === 'video') {
        if (!videoFile) {
          toast.error('Please select a video first.');
          return;
        }
        const uploadRes = await storyService.uploadMedia(videoFile);
        await storyService.createStory({
          mediaType: 'video',
          mediaUrl: uploadRes.url,
          caption: videoCaption,
          duration: Math.min(videoDuration || 15, 60),
          visibility: privacy.visibility,
          allowedViewers: privacy.allowedViewers,
          excludedViewers: privacy.excludedViewers
        });
        toast.success('Video Status published!');
      } else if (activeTab === 'text') {
        if (!textContent.trim()) {
          toast.error('Please write something for your status.');
          return;
        }
        await storyService.createStory({
          mediaType: 'text',
          caption: '',
          duration: 5,
          visibility: privacy.visibility,
          allowedViewers: privacy.allowedViewers,
          excludedViewers: privacy.excludedViewers,
          textConfig: {
            text: textContent.trim(),
            background: textBg,
            textColor,
            textAlign,
            fontStyle: 'normal'
          }
        });
        toast.success('Text Status published!');
      }

      onStoryCreated?.();
      onClose();
    } catch (err) {
      console.error('Failed to publish status:', err);
      toast.error(err.response?.data?.message || 'Failed to publish status. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <div
        className="create-status-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget && !publishing) onClose();
        }}
      >
        <div className="create-status-modal" role="dialog" aria-modal="true" aria-label="Create Status">
          {/* Header */}
          <div className="create-status-header">
            <h3 className="create-status-title">Add New Status</h3>
            <button
              type="button"
              className="story-icon-btn"
              onClick={onClose}
              disabled={publishing}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          {/* Tab Selector */}
          <div className="create-status-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'photo'}
              className={`create-status-tab-btn ${activeTab === 'photo' ? 'active' : ''}`}
              onClick={() => setActiveTab('photo')}
            >
              <span>📷</span>
              <span>Photo</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'video'}
              className={`create-status-tab-btn ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              <span>🎥</span>
              <span>Video</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'text'}
              className={`create-status-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              <span>✏️</span>
              <span>Text</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="create-status-body">
            {/* ── PHOTO TAB ── */}
            {activeTab === 'photo' && (
              <div>
                {!photoPreview ? (
                  <div
                    className="create-status-dropzone"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <span style={{ fontSize: 36 }}>🖼️</span>
                    <strong style={{ color: 'var(--text-main, #fff)', fontSize: 15 }}>
                      Click to choose an image
                    </strong>
                    <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 12 }}>
                      PNG, JPG, WEBP, GIF up to 15MB
                    </span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handlePhotoSelect}
                    />
                  </div>
                ) : (
                  <div>
                    <div className="create-status-preview-box">
                      <img src={photoPreview} alt="Status preview" />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => setIsCropping(true)}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ✂️ Crop & Reposition
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoPreview('');
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ef4444',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    maxLength={300}
                    placeholder="Add a caption..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-input, rgba(0,0,0,0.2))',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                      borderRadius: 10,
                      color: 'var(--text-main, #fff)',
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── VIDEO TAB ── */}
            {activeTab === 'video' && (
              <div>
                {!videoPreview ? (
                  <div
                    className="create-status-dropzone"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <span style={{ fontSize: 36 }}>🎬</span>
                    <strong style={{ color: 'var(--text-main, #fff)', fontSize: 15 }}>
                      Click to choose a video
                    </strong>
                    <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 12 }}>
                      MP4 or WebM up to 50MB (max 60 seconds)
                    </span>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      style={{ display: 'none' }}
                      onChange={handleVideoSelect}
                    />
                  </div>
                ) : (
                  <div>
                    <div className="create-status-preview-box">
                      <video
                        src={videoPreview}
                        controls
                        onLoadedMetadata={handleVideoMetadataLoaded}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
                        Duration: <strong>{videoDuration}s</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoFile(null);
                          setVideoPreview('');
                          setVideoDuration(0);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ef4444',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Change Video
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <input
                    type="text"
                    value={videoCaption}
                    onChange={(e) => setVideoCaption(e.target.value)}
                    maxLength={300}
                    placeholder="Add a caption..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-input, rgba(0,0,0,0.2))',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                      borderRadius: 10,
                      color: 'var(--text-main, #fff)',
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── TEXT TAB ── */}
            {activeTab === 'text' && (
              <div>
                {/* Live Preview Card */}
                <div
                  style={{
                    width: '100%',
                    minHeight: 180,
                    borderRadius: 14,
                    background: textBg,
                    padding: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
                    boxSizing: 'border-box',
                    marginBottom: 16
                  }}
                >
                  <span
                    style={{
                      color: textColor,
                      fontSize: 20,
                      fontWeight: 700,
                      textAlign,
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                      maxWidth: '100%'
                    }}
                  >
                    {textContent || 'Type your status update...'}
                  </span>
                </div>

                {/* Text Input */}
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What's on your mind?"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--bg-input, rgba(0,0,0,0.2))',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    borderRadius: 10,
                    color: 'var(--text-main, #fff)',
                    fontSize: 14,
                    boxSizing: 'border-box',
                    resize: 'none'
                  }}
                />

                {/* Customizations Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                  {/* Background Palette */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                      Background Theme
                    </label>
                    <div className="color-preset-palette">
                      {TEXT_BACKGROUNDS.map((bg) => (
                        <div
                          key={bg.id}
                          className={`color-preset-pill ${textBg === bg.value ? 'active' : ''}`}
                          style={{ background: bg.value }}
                          title={bg.name}
                          onClick={() => setTextBg(bg.value)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Text Color & Alignment Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                        Text Color
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {TEXT_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setTextColor(c.value)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: c.value,
                              border: textColor === c.value ? '2px solid #7c3aed' : '1px solid rgba(255,255,255,0.3)',
                              cursor: 'pointer'
                            }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                        Alignment
                      </label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['left', 'center', 'right'].map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => setTextAlign(align)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: textAlign === align ? 'var(--color-primary, #7c3aed)' : 'rgba(255,255,255,0.1)',
                              color: '#fff',
                              border: 'none',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              textTransform: 'capitalize'
                            }}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Publish & Privacy Action Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {/* Privacy Selector Trigger Badge */}
              <button
                type="button"
                className="story-privacy-badge-btn"
                onClick={() => setShowPrivacySelector(true)}
                title="Change who can view this status"
                disabled={publishing}
              >
                <span>
                  {privacy.visibility === 'friends_except' ? '🚫' : privacy.visibility === 'only_share_with' ? '⭐' : '👥'}
                </span>
                <span>
                  {privacy.visibility === 'friends_except'
                    ? `Friends Except (${privacy.excludedViewers?.length || 0})`
                    : privacy.visibility === 'only_share_with'
                    ? `Only Share (${privacy.allowedViewers?.length || 0})`
                    : 'Status (My Contacts)'}
                </span>
                <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={publishing}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    background: 'transparent',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                    color: 'var(--text-main, #fff)',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 10,
                    background: 'var(--color-primary, var(--theme-primary, #7c3aed))',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: publishing ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.4)'
                  }}
                >
                  {publishing ? 'Publishing...' : 'Share Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Cropper Sub-Modal */}
      {isCropping && photoPreview && (
        <ImageCropperModal
          imageSrc={photoPreview}
          aspect={9 / 16} // 9:16 mobile story aspect
          onCropComplete={handleCropComplete}
          onCancel={() => setIsCropping(false)}
        />
      )}

      {/* Privacy Selector Sub-Modal */}
      {showPrivacySelector && (
        <StoryPrivacySelector
          isOpen={showPrivacySelector}
          onClose={() => setShowPrivacySelector(false)}
          initialPrivacy={privacy}
          onSave={async (updatedPrivacy) => {
            setPrivacy(updatedPrivacy);
          }}
          title="Status Privacy"
        />
      )}
    </>
  );
}

CreateStatusModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onStoryCreated: PropTypes.func
};
