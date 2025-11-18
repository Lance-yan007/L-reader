// ============================================
// 页面加载完成后初始化
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
    initScrollAnimations();
    initSmoothScroll();
    initHeaderScroll();
    initMobileMenu();
    initButtonHovers();
    initParallaxEffects();
});

// ============================================
// 导航栏功能
// ============================================
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetSection.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ============================================
// 滚动动画
// ============================================
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('aos-animate');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // 观察所有需要动画的元素
    const animatedElements = document.querySelectorAll('[data-aos]');
    animatedElements.forEach(el => observer.observe(el));
}

// ============================================
// 平滑滚动
// ============================================
function initSmoothScroll() {
    // 为所有锚点链接添加平滑滚动
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            
            if (target) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = target.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ============================================
// 导航栏滚动效果
// ============================================
function initHeaderScroll() {
    const header = document.querySelector('.header');
    let lastScroll = 0;
    
    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;
        
        // 添加滚动阴影
        if (currentScroll > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });
}

// ============================================
// 移动端菜单
// ============================================
function initMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            
            // 切换图标
            const icon = this.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }
    
    // 点击链接后关闭菜单
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        link.addEventListener('click', function() {
            navLinks.classList.remove('active');
            if (menuToggle) {
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    });
}

// ============================================
// 按钮悬停效果增强
// ============================================
function initButtonHovers() {
    const buttons = document.querySelectorAll('.btn-primary, .btn-secondary, .btn-download-nav, .btn-pricing');
    
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

// ============================================
// 视差滚动效果
// ============================================
function initParallaxEffects() {
    const heroMockup = document.querySelector('.hero-mockup');
    const gradientOrbs = document.querySelectorAll('.gradient-orb');
    
    if (heroMockup) {
        window.addEventListener('scroll', function() {
            const scrolled = window.pageYOffset;
            const rate = scrolled * 0.5;
            
            if (scrolled < window.innerHeight) {
                heroMockup.style.transform = `perspective(1000px) rotateY(-5deg) rotateX(5deg) translateY(${rate}px)`;
            }
        });
    }
    
    // 渐变球体动画
    gradientOrbs.forEach((orb, index) => {
        window.addEventListener('scroll', function() {
            const scrolled = window.pageYOffset;
            const rate = scrolled * (0.2 + index * 0.1);
            
            if (scrolled < window.innerHeight) {
                orb.style.transform = `translate(${rate * 0.3}px, ${rate * 0.5}px)`;
            }
        });
    });
}

// ============================================
// 功能卡片交互效果
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
});

// ============================================
// 定价卡片交互
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const pricingCards = document.querySelectorAll('.pricing-card');
    
    pricingCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            if (!this.classList.contains('featured')) {
                this.style.transform = 'translateY(-8px)';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            if (!this.classList.contains('featured')) {
                this.style.transform = 'translateY(0)';
            }
        });
    });
});

// ============================================
// 下载按钮点击事件
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const downloadButtons = document.querySelectorAll('.btn-download-nav, .btn-primary, .btn-download-platform');
    
    downloadButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // 这里可以添加实际的下载逻辑
            console.log('下载按钮被点击');
            
            // 添加点击反馈
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
});

// ============================================
// 数字计数动画
// ============================================
function animateCounter(element, target, duration = 2000) {
    let start = 0;
    const increment = target / (duration / 16);
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            element.textContent = formatNumber(target);
            clearInterval(timer);
        } else {
            element.textContent = formatNumber(Math.floor(start));
        }
    }, 16);
}

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K+';
    }
    return num.toString();
}

// 当统计数字进入视口时开始动画
document.addEventListener('DOMContentLoaded', function() {
    const statsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const statNumber = entry.target.querySelector('.stat-number');
                if (statNumber && !statNumber.classList.contains('animated')) {
                    statNumber.classList.add('animated');
                    const text = statNumber.textContent;
                    const number = parseFloat(text.replace(/[^0-9.]/g, ''));
                    if (!isNaN(number)) {
                        statNumber.textContent = '0';
                        animateCounter(statNumber, number);
                    }
                }
            }
        });
    }, { threshold: 0.5 });

    const statItems = document.querySelectorAll('.stat-item');
    statItems.forEach(item => statsObserver.observe(item));
});

// ============================================
// 页面加载动画
// ============================================
window.addEventListener('load', function() {
    document.body.classList.add('loaded');
    
    // 延迟显示内容，创建淡入效果
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.opacity = '0';
        setTimeout(() => {
            heroContent.style.transition = 'opacity 0.6s ease';
            heroContent.style.opacity = '1';
        }, 100);
    }
});

// ============================================
// 响应式导航栏
// ============================================
function handleResize() {
    const navLinks = document.querySelector('.nav-links');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    
    if (window.innerWidth > 768) {
        navLinks.classList.remove('active');
        if (menuToggle) {
            const icon = menuToggle.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    }
}

window.addEventListener('resize', handleResize);

// ============================================
// 添加移动端菜单样式（通过JavaScript动态添加）
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    if (window.innerWidth <= 768) {
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .nav-links {
                    position: fixed;
                    top: 70px;
                    left: 0;
                    width: 100%;
                    background: var(--bg-white);
                    flex-direction: column;
                    padding: var(--spacing-md);
                    box-shadow: var(--shadow-lg);
                    transform: translateX(-100%);
                    transition: transform var(--transition-normal);
                    z-index: 999;
                }
                
                .nav-links.active {
                    transform: translateX(0);
                }
                
                .nav-links li {
                    width: 100%;
                    margin: 0;
                    padding: var(--spacing-sm) 0;
                }
                
                .nav-links a {
                    display: block;
                    padding: var(--spacing-sm);
                }
            }
        `;
        document.head.appendChild(style);
    }
});

// ============================================
// 平滑的页面滚动指示器
// ============================================
function createScrollIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'scroll-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 3px;
        background: var(--gradient-primary);
        z-index: 10000;
        transition: width 0.1s ease;
    `;
    document.body.appendChild(indicator);
    
    window.addEventListener('scroll', function() {
        const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (window.pageYOffset / windowHeight) * 100;
        indicator.style.width = scrolled + '%';
    });
}

// 创建滚动指示器
createScrollIndicator();

// ============================================
// 控制台欢迎信息
// ============================================
console.log('%c欢迎使用 L-reader!', 'color: #6366F1; font-size: 20px; font-weight: bold;');
console.log('%c专为中国留学生设计的智能PDF阅读器', 'color: #6C757D; font-size: 14px;');

