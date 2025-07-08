window.createExtractButton = function(container, onExtract) {
  const btn = document.createElement('button');
  btn.id = 'extract';
  btn.className = 'download-btn';
  btn.textContent = 'Extract Current Posts';
  btn.style.marginBottom = '10px';
  btn.addEventListener('click', onExtract);
  container.appendChild(btn);
  return btn;
}; 