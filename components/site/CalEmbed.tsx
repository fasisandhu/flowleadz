'use client';

type Props = {
  username: string;
  event: string;
  prefill?: { name?: string; email?: string; notes?: string };
};

export default function CalEmbed({ username, event, prefill }: Props) {
  const params = new URLSearchParams();
  params.set('embed', 'true');
  if (prefill?.name) params.set('name', prefill.name);
  if (prefill?.email) params.set('email', prefill.email);
  if (prefill?.notes) params.set('notes', prefill.notes);

  const url = `https://cal.com/${username}/${event}?${params.toString()}`;

  return (
    <iframe
      src={url}
      title="Book your strategy call"
      loading="lazy"
      className="cal-iframe"
      style={{
        width: '100%',
        border: 'none',
        borderRadius: 18,
        background: '#fff',
        boxShadow: '0 30px 80px -30px rgba(0,0,0,0.5)',
      }}
    />
  );
}
