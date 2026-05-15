export async function mount(container, api) {
  const ta = container.querySelector('textarea');

  const saved = await api.getContent();
  if (typeof saved === 'string') {
    ta.value = saved;
  }

  ta.addEventListener('input', () => {
    api.saveContent(ta.value);
  });
}
