import { useEffect, useState } from 'preact/hooks';

export function AppUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    const check = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || !active) return;
      const detect = () => {
        if (active && registration.waiting) setWaiting(registration.waiting);
      };
      detect();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', detect);
      });
      await registration.update();
      detect();
    };
    const resume = () => { if (document.visibilityState === 'visible') void check().catch(() => {}); };
    void navigator.serviceWorker.ready.then(resume);
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; document.removeEventListener('visibilitychange', resume); };
  }, []);
  return waiting && <div class="status-banner">An app update is ready. <button class="text-button" onClick={() => {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage('SKIP_WAITING');
  }}>Reload app</button></div>;
}
