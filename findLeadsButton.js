window.createFindLeadsButton = function(container, onFindLeads) {
  const btn = document.createElement('button');
  btn.id = 'findLeads';
  btn.className = 'download-btn';
  btn.textContent = 'Find Leads & Download as CSV';
  btn.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)';
  btn.style.width = '100%';
  btn.style.marginBottom = '10px';
  btn.addEventListener('click', onFindLeads);
  container.appendChild(btn);
  return btn;
}; 