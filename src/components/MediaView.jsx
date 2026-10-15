import { useEffect, useState } from 'react';
import { apiBlob } from '../api.js';

// Shows a customer's photo, video, voice note or document inside a chat bubble.
export default function MediaView({ messageId, kind, name }) {
  const [state, setState] = useState({ url: '', type: '', error: '', loading: true });

  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setState({ url: '', type: '', error: '', loading: true });
    apiBlob(`/portal/messages/${messageId}/media`)
      .then(({ blob, type }) => {
        if (!alive) return;
        objectUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
        setState({ url: objectUrl, type, error: '', loading: false });
      })
      .catch((e) => alive && setState({ url: '', type: '', error: e.message, loading: false }));
    return () => {
      alive = false;
      if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
    };
  }, [messageId]);

  if (state.loading) return <div className="media-box muted small">Loading {kind}...</div>;
  if (state.error) return <div className="media-box error-text small">Could not open this {kind}: {state.error}</div>;
  const t = state.type || '';
  if (kind === 'image' || kind === 'sticker' || t.startsWith('image/')) {
    return <a href={state.url} target="_blank" rel="noreferrer"><img className="media-img" src={state.url} alt={name || kind} /></a>;
  }
  if (kind === 'audio' || t.startsWith('audio/')) return <audio className="media-audio" controls src={state.url} />;
  if (kind === 'video' || t.startsWith('video/')) return <video className="media-img" controls src={state.url} />;
  return <a className="btn ghost small" href={state.url} download={name || 'file'}>Download {name || 'document'}</a>;
}
