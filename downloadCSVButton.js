window.createDownloadCSVButton = function(container, onDownloadCSV) {
  const btn = document.createElement('button');
  btn.id = 'downloadCSV';
  btn.className = 'download-btn';
  btn.textContent = 'Download as CSV';
  btn.disabled = true;
  btn.addEventListener('click', onDownloadCSV);
  container.appendChild(btn);
  return btn;
}; 