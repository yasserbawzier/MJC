document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.page-section');

    function navigateTo(hash) {
        const targetLink = Array.from(links).find(link => link.getAttribute('href') === hash);
        
        if (targetLink) {
            // تفعيل الزر في القائمة الجانبية
            links.forEach(l => l.classList.remove('active'));
            targetLink.classList.add('active');

            if (hash === '#catalog') {
                const iframeSection = document.getElementById('section-iframe-spa');
                const loader = document.getElementById('iframeViewLoader');
                const spinner = document.getElementById('iframeViewSpinner');
                
                if (iframeSection && loader) {
                    // Hide all other active page sections
                    document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('hidden'));
                    
                    if (spinner) spinner.classList.remove('hidden');
                    loader.src = 'assets/html/catalog.html';
                    iframeSection.classList.remove('hidden');
                }
                return;
            }

            // إظهار القسم المطلوب وإخفاء الباقي
            const sectionId = hash.replace('#', 'section-');
            document.querySelectorAll('.page-section').forEach(sec => {
                if(sec.id === sectionId) {
                    sec.classList.remove('hidden');
                } else {
                    sec.classList.add('hidden');
                }
            });

            // Clear iframe if navigating away to a different main section
            const loader = document.getElementById('iframeViewLoader');
            if (loader) {
                loader.src = '';
            }
        }
    }

    window.addEventListener('hashchange', () => {
        if (window.location.hash) {
            navigateTo(window.location.hash);
        }
    });

    if (window.location.hash) {
        navigateTo(window.location.hash);
    } else {
        window.location.hash = '#invoices';
    }
});

// دالة طي وإظهار القائمة الجانبية (Sidebar Toggle)
function toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}
