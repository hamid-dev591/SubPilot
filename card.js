/**
 * ==========================================================================
 * SUBPILOT - EXTERNAL MODULE: GLASS CARD & SECURITY AUDIT (FIXED VERSION)
 * ==========================================================================
 */

window.updateGlassCard = function() {
    const card = document.getElementById('glass-total-amount');
    if (!card) return;
    
    let total = 0;
    const state = window.appState ? window.appState() : null;
    
    if (!state || !state.subscriptions) return;
    
    state.subscriptions.forEach(sub => {
        // نعتبر الاشتراك نشطاً دائماً، إلا إذا كان مكتوباً صراحة "paused" أو "متوقف"
        const isPaused = sub.status && sub.status.toLowerCase() === 'paused';
        
        if (!isPaused) {
            // الحساب الرياضي المضمون 100% داخل الملف 
            let price = parseFloat(sub.price) || 0;
            let cycle = (sub.cycle || 'monthly').toLowerCase();
            let monthlyCost = 0;
            
            if (cycle === 'yearly') {
                monthlyCost = price / 12;
            } else if (cycle === 'weekly') {
                monthlyCost = price * 4.33; // تقريباً 4.33 أسبوع في الشهر
            } else {
                monthlyCost = price; // الافتراضي (الشهري)
            }
            
            total += monthlyCost;
        }
    });
    
    // عرض النتيجة (نستخدم دالة موقعك إذا توفرت، أو نعرضها مباشرة كدولار)
    if (window.appFormatCurrency) {
        card.textContent = window.appFormatCurrency(total);
    } else {
        card.textContent = `$${total.toFixed(2)}`;
    }
};

window.runSecurityAudit = function() {
    let warnings = [];
    let names = new Set();
    const state = window.appState ? window.appState() : null;
    if (!state) return;
    
    state.subscriptions.forEach(sub => {
        let subName = (sub.name || '').toLowerCase().trim();
        if (names.has(subName) && subName !== '') {
            warnings.push(`⚠️ لديك اشتراك مكرر باسم "${sub.name}"!`);
        }
        names.add(subName);
        
        let price = parseFloat(sub.price) || 0;
        let cycle = (sub.cycle || 'monthly').toLowerCase();
        let monthlyCost = (cycle === 'yearly') ? (price / 12) : price;

        if (monthlyCost > 99) {
            warnings.push(`💸 تنبيه: اشتراك "${sub.name}" يسحب مبلغا كبيرا شهريا. تأكد منه.`);
        }
    });
    
    if (warnings.length === 0) {
        if(window.appShowNotification) window.appShowNotification("الفحص سليم: لا توجد أخطاء.", "success");
        else alert("الفحص سليم: لا توجد أخطاء.");
    } else {
        if(window.appShowNotification) warnings.forEach(w => window.appShowNotification(w, "error"));
        else alert(warnings.join('\n'));
    }
};

window.updateStorageTracker = function() {
    const bar = document.getElementById('storage-fill-bar');
    const text = document.getElementById('storage-text');
    if (!bar || !text) return;
    
    const storedData = localStorage.getItem('subpilot_data') || '';
    const kbSize = (storedData.length * 2) / 1024; 
    const maxKb = 5120; 
    const percentage = Math.min((kbSize / maxKb) * 100, 100);
    
    bar.style.width = `${percentage}%`;
    text.textContent = `${kbSize.toFixed(2)} KB / 5000 KB`;
};

// ==========================================
// AUTO-UPDATE TRIGGERS (المشغلات التلقائية)
// ==========================================

// 1. التحديث عند فتح الصفحة أو تبديل الواجهة
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        updateGlassCard();
        updateStorageTracker();
    }, 800);
});

// 2. تحديث تلقائي عند الضغط على أي زر (مثل زر الإضافة، الحذف، أو الاستيراد)
// هذا يغنيك عن الحاجة للتدخل في ملف script.js الأساسي
document.addEventListener('click', (e) => {
    // نتحقق إذا كان العنصر الذي تم النقر عليه هو زر أو داخل زر
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        // ننتظر نصف ثانية حتى يقوم تطبيقك بحفظ البيانات الجديدة في المتصفح، ثم نعيد الحساب
        setTimeout(() => {
            updateGlassCard();
            updateStorageTracker();
        }, 500); 
    }
});