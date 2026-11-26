const share = document.querySelector('#footerShare');
const button = share.querySelector('button');
const status = share.querySelector('[role="status"]');
const copy = share.querySelector('label');
const input = copy.querySelector('input');
const url = new URL('./', window.location.href).href;
const data = {title: 'Pakkasukko — Дед Мороз в Финляндии', url};

input.value = url;
share.hidden = false;
button.addEventListener('click', async () => {
  status.textContent = '';
  copy.hidden = true;
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    status.textContent = 'Ссылка скопирована.';
  } catch {
    copy.hidden = false;
    input.focus();
    input.select();
    status.textContent = 'Скопируйте выделенную ссылку.';
  }
});
