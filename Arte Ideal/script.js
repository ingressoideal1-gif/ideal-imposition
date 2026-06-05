document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    
    if (mobileBtn && navMenu) {
        mobileBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            const target = document.querySelector(targetId);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add scroll effect to header
    const header = document.querySelector('.header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.boxShadow = '0 5px 20px rgba(0,0,0,0.1)';
        } else {
            header.style.boxShadow = '0 2px 15px rgba(0,0,0,0.05)';
        }
    });

    // Cart Logic
    let cart = JSON.parse(localStorage.getItem('ingressoIdealCart')) || [];
    
    function updateCartUI() {
        const badges = document.querySelectorAll('.badge');
        badges.forEach(badge => badge.innerText = cart.length);
        
        const cartItemsContainer = document.getElementById('cart-items');
        const checkoutBtn = document.getElementById('checkout-btn');
        
        if (cartItemsContainer) {
            if (cart.length === 0) {
                cartItemsContainer.innerHTML = '<p>Seu carrinho está vazio.</p>';
                if (checkoutBtn) checkoutBtn.disabled = true;
            } else {
                cartItemsContainer.innerHTML = '';
                cart.forEach((item, index) => {
                    const div = document.createElement('div');
                    div.className = 'cart-item';
                    div.innerHTML = `
                        <span>${item}</span>
                        <i class="fas fa-trash remove-item" data-index="${index}"></i>
                    `;
                    cartItemsContainer.appendChild(div);
                });
                
                if (checkoutBtn) checkoutBtn.disabled = false;
                
                document.querySelectorAll('.remove-item').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = e.target.getAttribute('data-index');
                        cart.splice(idx, 1);
                        saveCart();
                        updateCartUI();
                    });
                });
            }
        }
    }
    
    function saveCart() {
        localStorage.setItem('ingressoIdealCart', JSON.stringify(cart));
    }
    
    updateCartUI();

    document.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = e.target.closest('.add-to-cart').getAttribute('data-product');
            cart.push(product);
            saveCart();
            updateCartUI();
            alert(`${product} adicionado ao orçamento!`);
        });
    });

    // Modal Logic
    const cartModal = document.getElementById('cart-modal');
    const closeModal = document.querySelector('.close-modal');
    
    document.querySelectorAll('.cart-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            if (cartModal) cartModal.classList.add('active');
        });
    });
    
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            cartModal.classList.remove('active');
        });
    }
    
    window.addEventListener('click', (e) => {
        if (e.target === cartModal) {
            cartModal.classList.remove('active');
        }
    });

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            const message = "Olá! Gostaria de um orçamento para os seguintes itens: " + cart.join(', ');
            const whatsappUrl = `https://wa.me/555130932840?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        });
    }
});
