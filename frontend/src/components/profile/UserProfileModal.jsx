import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/useAuth';
import ImageCropperModal from './ImageCropperModal';

export default function UserProfileModal({ targetUserId, onClose }) {
  const { user: currentUser, updateLocalUser } = useAuth();
  
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Image Upload States
  const [cropTarget, setCropTarget] = useState(null); // 'avatar' or 'bannerImage'
  const [imageToCrop, setImageToCrop] = useState(null);
  const [cropAspect, setCropAspect] = useState(1);

  const fileInputRef = useRef(null);

  const isMe = currentUser && (targetUserId === currentUser._id || targetUserId === currentUser.id);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (isMe) {
          setProfileData(currentUser);
          setEditForm(currentUser);
          setLoading(false);
        } else {
          const response = await api.get(`/users/${targetUserId}`);
          setProfileData(response.data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
        setLoading(false);
      }
    };
    if (targetUserId) fetchProfile();
  }, [targetUserId, isMe, currentUser]);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        birthday: editForm.birthday ? editForm.birthday : null
      };
      const response = await api.put('/users/profile', payload);
      setProfileData(response.data);
      updateLocalUser(response.data);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save profile', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to save profile';
      alert(`Failed to save profile: ${errMsg}`);
    } finally {
      setSaving(false);
    }
  };

  // Image Upload Logic
  const handleImageSelect = (type) => {
    setCropTarget(type);
    setCropAspect(type === 'avatar' ? 1 : 16 / 9);
    fileInputRef.current.click();
  };

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setImageToCrop(reader.result));
      reader.readAsDataURL(file);
    }
    e.target.value = null; // reset input
  };

  const handleCropComplete = async (croppedBlob) => {
    setImageToCrop(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', croppedBlob, 'cropped.jpg');
      
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const fileUrl = uploadRes.data.url;
      
      // Instantly update the backend
      const updatePayload = { [cropTarget]: fileUrl };
      const res = await api.put('/users/profile', updatePayload);
      
      setProfileData(res.data);
      updateLocalUser(res.data);
      setEditForm((prev) => ({ ...prev, [cropTarget]: fileUrl }));
    } catch (err) {
      console.error('Failed to upload image', err);
      const errMsg = err.response?.data?.message || err.message || 'Upload failed';
      alert(`Upload failed: ${errMsg}`);
    } finally {
      setSaving(false);
      setCropTarget(null);
    }
  };

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>Loading Profile...</div>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>
            <p>Profile not found</p>
            <button onClick={onClose} style={btnStyle}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="user-profile-modal modal-box" style={modalStyle}>
        
        {/* Banner Section */}
        <div style={{ position: 'relative', height: 180, width: '100%', backgroundColor: '#111216', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' }}>
          <img src={(isEditing ? editForm.bannerImage : profileData.bannerImage) || 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1200&auto=format&fit=crop'} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {isEditing && (
            <button onClick={() => handleImageSelect('bannerImage')} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
              ✏️ Change Banner
            </button>
          )}
        </div>

        {/* Avatar Section */}
        <div style={{ position: 'relative', marginTop: -50, marginLeft: 20, width: 100, height: 100, borderRadius: '50%', backgroundColor: '#181a20', padding: 6 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 700 }}>
            {(isEditing ? editForm.avatar : profileData.avatar) ? (
              <img src={isEditing ? editForm.avatar : profileData.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (profileData.fullName || profileData.username)?.substring(0, 2).toUpperCase() || 'M'
            )}
          </div>
          {isEditing && (
            <div onClick={() => handleImageSelect('avatar')} style={{ position: 'absolute', inset: 6, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 24 }}>
              📷
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close"
          type="button"
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(0,0,0,0.65)',
            border: 'none',
            color: '#fff',
            width: 40,
            height: 40,
            minWidth: 40,
            minHeight: 40,
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          ✕
        </button>

        {/* Action Button (Edit / Save) */}
        {isMe && (
          <div className="profile-actions-bar" style={{ position: 'absolute', top: 190, right: 20 }}>
            {isEditing ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setIsEditing(false); setEditForm(profileData); }} style={{ ...btnStyle, background: '#374151' }}>Cancel</button>
                <button onClick={handleSaveProfile} disabled={saving} style={{ ...btnStyle, background: '#a855f7' }}>
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            ) : (
              <button onClick={() => setIsEditing(true)} style={{ ...btnStyle, background: '#374151' }}>
                Edit Profile
              </button>
            )}
          </div>
        )}

        {/* Profile Info */}
        <div style={{ padding: '10px 20px 20px 20px' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 10 }}>
              <div className="profile-form-row" style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Username</label>
                  <input type="text" name="username" value={editForm.username || ''} onChange={handleEditChange} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Full Name</label>
                  <input type="text" name="fullName" value={editForm.fullName || ''} onChange={handleEditChange} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Bio</label>
                <textarea name="bio" value={editForm.bio || ''} onChange={handleEditChange} style={{ ...inputStyle, height: 80, resize: 'none' }} placeholder="About me..." />
              </div>
              <div className="profile-form-row" style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Location</label>
                  <input type="text" name="location" value={editForm.location || ''} onChange={handleEditChange} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Website</label>
                  <input type="text" name="website" value={editForm.website || ''} onChange={handleEditChange} style={inputStyle} />
                </div>
              </div>
              <div className="profile-form-row" style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>GitHub</label>
                  <input type="text" name="github" value={editForm.github || ''} onChange={handleEditChange} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>LinkedIn</label>
                  <input type="text" name="linkedin" value={editForm.linkedin || ''} onChange={handleEditChange} style={inputStyle} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <h2 style={{ margin: 0, color: '#f3f4f6', fontSize: 24, fontWeight: 800 }}>{profileData.fullName || profileData.username}</h2>
              <div style={{ color: '#9ca3af', fontSize: 14 }}>@{profileData.username}</div>
              
              {profileData.customStatus?.text && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '6px 12px', background: '#2e3342', borderRadius: 20, color: '#f3f4f6', fontSize: 13, border: '1px solid #3f4657' }}>
                  <span>{profileData.customStatus.emoji}</span>
                  <span>{profileData.customStatus.text}</span>
                </div>
              )}
              
              <div style={{ margin: '20px 0', padding: '15px', background: '#1c1f28', borderRadius: 8, color: '#d1d5db', fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {profileData.bio || <span style={{ color: '#6b7280', fontStyle: 'italic' }}>No bio provided.</span>}
              </div>

              <div className="ui-chip-group" style={{ gap: 10, marginTop: 15 }}>
                {profileData.location && (
                  <div style={infoCardStyle}>
                    <span style={infoIconStyle}>📍</span> {profileData.location}
                  </div>
                )}
                {profileData.website && (
                  <div style={infoCardStyle}>
                    <span style={infoIconStyle}>🔗</span> <a href={profileData.website} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>{profileData.website}</a>
                  </div>
                )}
                {profileData.github && (
                  <div style={infoCardStyle}>
                    <span style={infoIconStyle}>🐙</span> <a href={`https://github.com/${profileData.github.replace('https://github.com/', '')}`} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>{profileData.github}</a>
                  </div>
                )}
                {profileData.linkedin && (
                  <div style={infoCardStyle}>
                    <span style={infoIconStyle}>💼</span> <a href={profileData.linkedin.includes('http') ? profileData.linkedin : `https://linkedin.com/in/${profileData.linkedin}`} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>LinkedIn</a>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 30, fontSize: 12, color: '#6b7280', borderTop: '1px solid #2d3241', paddingTop: 15 }}>
                Member since {new Date(profileData.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden File Input */}
      <input type="file" accept="image/*" ref={fileInputRef} onChange={onFileChange} style={{ display: 'none' }} />

      {/* Cropper Modal Overlay */}
      {imageToCrop && (
        <ImageCropperModal 
          imageSrc={imageToCrop} 
          aspect={cropAspect} 
          onCancel={() => setImageToCrop(null)}
          onCropComplete={handleCropComplete} 
        />
      )}
    </div>
  );
}

// Styles
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
};
const modalStyle = {
  width: '100%', maxWidth: 600, background: '#181a20', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', position: 'relative', overflowY: 'auto', maxHeight: '90vh'
};
const btnStyle = {
  minHeight: 42, padding: '8px 16px', borderRadius: 6, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
};
const inputStyle = {
  width: '100%', padding: '10px', borderRadius: 6, background: '#111216', border: '1px solid #2d3241', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box'
};
const labelStyle = {
  display: 'block', marginBottom: 5, fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase'
};
const infoCardStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#d1d5db', background: '#1c1f28', padding: '8px 14px', borderRadius: 8, minHeight: 36, border: '1px solid #2d3241'
};
const infoIconStyle = {
  fontSize: 16
};
