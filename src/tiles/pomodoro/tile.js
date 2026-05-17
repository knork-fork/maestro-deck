export async function mount(container, api) {
  const display  = container.querySelector('.pom-display');
  const startBtn = container.querySelector('.pom-start');
  const resetBtn = container.querySelector('.pom-reset');
  const durInput = container.querySelector('.pom-duration');

  const saved = await api.getContent();
  let totalSeconds = (saved?.totalSeconds) ?? 25 * 60;
  let remaining    = (saved?.remaining)    ?? totalSeconds;
  let running      = false;
  let intervalId   = null;

  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function render() {
    display.textContent = fmt(remaining);
    durInput.value = Math.round(totalSeconds / 60);
    durInput.disabled = running || remaining !== totalSeconds;

    if (remaining === 0) {
      display.classList.add('done');
    } else {
      display.classList.remove('done');
    }

    startBtn.textContent = running ? 'Pause' : 'Start';
    startBtn.classList.toggle('running', running);
    startBtn.disabled = remaining === 0;
  }

  function save() {
    api.saveContent({ totalSeconds, remaining });
  }

  function onDone() {
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    render();
    save();

    const appBlurred = document.body.classList.contains('window-blurred');
    const tabHidden  = container.closest('.tab-canvas')?.classList.contains('hidden') ?? false;
    if ((appBlurred || tabHidden) && Notification.permission === 'granted') {
      new Notification('Pomodoro', { body: 'Timer finished.' });
    }
  }

  function tick() {
    if (remaining > 0) {
      remaining--;
      render();
      save();
    }
    if (remaining === 0) {
      onDone();
    }
  }

  function start() {
    if (remaining === 0 || running) return;
    running = true;
    render();
    intervalId = setInterval(tick, 1000);
  }

  function pause() {
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    render();
    save();
  }

  function reset() {
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    remaining = totalSeconds;
    render();
    save();
  }

  startBtn.addEventListener('click', () => {
    if (running) pause(); else start();
  });

  resetBtn.addEventListener('click', reset);

  durInput.addEventListener('change', () => {
    const mins = Math.max(1, Math.min(99, parseInt(durInput.value, 10) || 25));
    totalSeconds = mins * 60;
    remaining = totalSeconds;
    render();
    save();
  });

  render();

  return () => {
    clearInterval(intervalId);
  };
}
