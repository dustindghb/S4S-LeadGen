window.createDownloadCSVButton = function(container, onDownload) {
  const btn = document.createElement('button');
  btn.id = 'downloadCSV';
  btn.className = 'download-btn';
  btn.textContent = 'Download Leads as CSV';
  btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
  btn.style.width = '100%';
  btn.style.marginBottom = '10px';
  btn.addEventListener('click', onDownload);
  container.appendChild(btn);
  return btn;
};

window.createDownloadAllPostsButton = function(container, onDownload) {
  const btn = document.createElement('button');
  btn.id = 'downloadAllPosts';
  btn.className = 'download-btn';
  btn.textContent = 'Download All Analyzed Posts';
  btn.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
  btn.style.width = '100%';
  btn.style.marginBottom = '10px';
  btn.addEventListener('click', onDownload);
  container.appendChild(btn);
  return btn;
}; 