import * as THREE from 'three';
import './style.css';
import { createIcons as lucideCreateIcons, icons as lucideIcons } from 'lucide';
import type { InventoryItem, ActivityLog, RequestRecord, BorrowRecord } from './types';

// Global declarations for CDN / bundled libraries
declare const lucide: {
    createIcons: (options?: any) => void;
};

// Safe, universal Lucide icon creator that never throws even if options or icons are omitted
function safeCreateIcons(options?: any) {
    const opts = options || {};
    // 1. If CDN lucide is loaded and has createIcons
    try {
        const cdnLucide = (window as any).__cdnLucide || (window as any).lucide;
        if (cdnLucide && typeof cdnLucide.createIcons === 'function' && cdnLucide.createIcons !== safeCreateIcons && (window as any).__hasCdnLucide) {
            cdnLucide.createIcons(opts);
            return;
        }
    } catch {
        // Fall back to bundled NPM
    }

    // 2. Bundled NPM icons (always has all 2,000+ Lucide icons)
    try {
        lucideCreateIcons({
            icons: lucideIcons,
            nameAttr: 'data-lucide',
            ...(opts.root ? { root: opts.root } : {})
        });
    } catch (err) {
        console.warn('Lucide icon rendering fallback notice:', err);
    }
}

if (typeof window !== 'undefined') {
    (window as any).__rawLucideCreateIcons = safeCreateIcons;
    (window as any).lucide = {
        createIcons: (options?: any) => {
            try {
                safeCreateIcons(options);
            } catch (err) {
                console.warn('Lucide createIcons notice:', err);
            }
        }
    };
}

// Safe, idempotent Lucide icon renderer that NEVER destroys already-rendered SVGs
function renderLucideIcons(root?: HTMLElement | Document | null) {
    const target = root || document;

    // Only select elements that need icon creation (not already rendered SVGs)
    const placeholders = target.querySelectorAll('i[data-lucide], span[data-lucide], [data-lucide]:not(svg)');
    if (placeholders.length === 0) return;

    try {
        safeCreateIcons({
            root: target instanceof HTMLElement ? target : undefined
        });
    } catch {
        try { safeCreateIcons(); } catch {}
    }

    // Strip data-lucide from rendered SVGs to prevent future calls from destroying/re-rendering them
    const renderedSvgs = target.querySelectorAll('svg[data-lucide]');
    renderedSvgs.forEach(svg => {
        svg.removeAttribute('data-lucide');
        svg.setAttribute('data-lucide-rendered', 'true');
    });
}

// Ultra-fast inline SVG generator for cards to avoid synchronous Lucide DOM queries
function getFastIconSvg(name: string, size: number = 13): string {
    const s = `${size}px`;
    switch (name) {
        case 'map-pin':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`;
        case 'shopping-bag':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
        case 'check':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><polyline points="20 6 9 17 4 12"/></svg>`;
        case 'trash-2':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
        case 'clock':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        case 'package-check':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
        case 'arrow-right':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
        case 'corner-up-left':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
        case 'minus':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M5 12h14"/></svg>`;
        case 'plus':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
        case 'calendar':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`;
        case 'link':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${s};height:${s};vertical-align:middle;" data-lucide-rendered="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
        default:
            return `<i data-lucide="${name}"></i>`;
    }
}

// Intercept lucide.createIcons globally so ANY third-party or legacy call is automatically safe
if (typeof window !== 'undefined') {
    const installLucideGuard = () => {
        (window as any).lucide = (window as any).lucide || {};
        (window as any).lucide.createIcons = (options?: any) => {
            const root = options && options.root ? options.root : undefined;
            renderLucideIcons(root);
        };
    };
    installLucideGuard();
    window.addEventListener('DOMContentLoaded', installLucideGuard);
}

// Dynamic API URL for Local Development & Live Production
const isLocalHost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('172.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.endsWith('.local')
);

let API_BASE = (() => {
    if (typeof window !== 'undefined' && window.location) {
        const host = window.location.hostname;
        // When accessed from a mobile phone or another device on LAN (e.g. 192.168.x.x:5173),
        // route directly to that same machine IP on port 5000 instead of literal localhost:5000
        if (isLocalHost && host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
            return `http://${host}:5000/api`;
        }
    }
    return (import.meta.env.VITE_API_BASE as string) ||
        (import.meta.env.VITE_API_BASE_URL as string) ||
        (isLocalHost
            ? `http://${(typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? 'localhost' : (typeof window !== 'undefined' ? window.location.hostname : 'localhost')}:5000/api`
            : '/api');
})();

const CLOUD_API_FALLBACK = (import.meta.env.VITE_API_FALLBACK_URL as string) || (import.meta.env.VITE_API_BASE as string) || (import.meta.env.VITE_API_BASE_URL as string) || '/api';

// Intelligent Automatic Failover: If local backend request fails, fall back for that request without permanently poisoning API_BASE
if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        try {
            const res = await originalFetch(input, init);
            if (res.status === 401) {
                const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
                if (urlStr && urlStr.includes('/api/auth/profile')) {
                    const token = localStorage.getItem('cicr_token');
                    if (token) {
                        console.warn('[CICR Auth] Profile session invalid or expired (401). Clearing session.');
                        if (typeof AuthManager !== 'undefined' && typeof AuthManager.handleLogout === 'function') {
                            AuthManager.handleLogout();
                        }
                    }
                }
            }
            return res;
        } catch (err: any) {
            const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
            if (urlStr && urlStr.includes(':5000/api') && !urlStr.includes('/auth/')) {
                const fallbackUrl = urlStr.replace(/https?:\/\/[^/]+:5000\/api/, CLOUD_API_FALLBACK);
                console.warn(`[CICR API] Local backend unreachable. Auto-falling back to cloud backend: ${fallbackUrl}`);
                return originalFetch(fallbackUrl, init);
            }
            throw err;
        }
    };
}

/**
 * Universal HTML escape helper that neutralizes: &, <, >, ", ', and `
 * Prevents attribute breakout and DOM injection.
 */
export function escapeHtml(str: any): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

type UserRole = 'ADMIN' | 'MEMBER';

// Top-level global binding for self-service password reset modal
(window as any).openPasswordResetModal = () => {
    const modal = document.getElementById('reset-password-modal');
    if (modal) modal.classList.add('active');
    if (typeof PasswordResetManager !== 'undefined') {
        PasswordResetManager.open();
    }
};

// Global state variables
let inventory: InventoryItem[] = [];
let logs: ActivityLog[] = [];
let requests: RequestRecord[] = [];
let selectedItem: InventoryItem | null = null;

/**
 * Resolves component stock status per specification:
 * - If total <= 1 (quantity = 1):
 *     available > 0  => "Available" (status-available)
 *     available <= 0 => "Not Available" (status-out)
 * - If total > 1:
 *     available <= 0 => "Not Available" (status-out)
 *     available > total / 2 => "Available" (status-available)
 *     available <= total / 2 => "Low Reserve" (status-low)
 */
function getItemStockStatus(totalQty: number, availableQty: number): {
    text: string;
    class: 'status-available' | 'status-low' | 'status-out';
} {
    const total = Number(totalQty) || 0;
    const available = Number(availableQty) || 0;

    if (total <= 1) {
        if (available > 0) {
            return { text: 'Available', class: 'status-available' };
        }
        return { text: 'Not Available', class: 'status-out' };
    }

    if (available <= 0) {
        return { text: 'Not Available', class: 'status-out' };
    }
    if (available > total / 2) {
        return { text: 'Available', class: 'status-available' };
    }
    return { text: 'Low Reserve', class: 'status-low' };
}

// ==========================================
// 1.5. Real-Time Floating Cyber Toast Notifications
// ==========================================
class ToastManager {
    private static container: HTMLElement | null = null;

    static init() {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toast-container';
                document.body.appendChild(this.container);
            }
        }
    }

    static show(title: string, desc: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') {
        this.init();
        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = `cyber-toast toast-${type}`;

        const iconName = type === 'success' ? 'check-circle'
            : type === 'warning' ? 'alert-triangle'
                : type === 'error' ? 'alert-octagon' : 'bell';

        toast.innerHTML = `
            <div class="toast-icon-wrap">
                <i data-lucide="${iconName}"></i>
            </div>
            <div class="toast-content-wrap">
                <h4 class="toast-title"></h4>
                <p class="toast-desc"></p>
            </div>
            <button class="toast-close-btn" title="Dismiss">
                <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
        `;

        const titleEl = toast.querySelector<HTMLElement>('.toast-title');
        if (titleEl) titleEl.textContent = title;
        const descEl = toast.querySelector<HTMLElement>('.toast-desc');
        if (descEl) descEl.textContent = desc;

        toast.querySelector('.toast-close-btn')!.addEventListener('click', () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 350);
        });

        this.container.appendChild(toast);
        renderLucideIcons(toast);

        requestAnimationFrame(() => {
            setTimeout(() => toast.classList.add('show'), 20);
        });

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                toast.classList.add('hide');
                setTimeout(() => toast.remove(), 350);
            }
        }, 4200);
    }

    static showWelcome(userName: string, role: string = 'MEMBER') {
        this.init();
        if (!this.container) return;

        const displayRole = (role || 'MEMBER').toUpperCase();
        const initial = (userName.trim().charAt(0) || 'U').toUpperCase();

        const toast = document.createElement('div');
        toast.className = 'cyber-toast toast-welcome';

        toast.innerHTML = `
            <div class="welcome-toast-glow"></div>
            <div class="welcome-avatar-wrap">
                <span class="welcome-avatar-letter"></span>
                <span class="welcome-status-dot"></span>
            </div>
            <div class="welcome-body">
                <div class="welcome-top-meta">
                    <span class="welcome-badge">
                        <i data-lucide="shield-check"></i> AUTHENTICATED
                    </span>
                    <span class="welcome-role-pill ${escapeHtml(displayRole.toLowerCase())}"></span>
                </div>
                <div class="welcome-headline">
                    Welcome, <span class="welcome-highlight-name"></span>
                </div>
                <div class="welcome-subtext">
                    Access granted to CICR Robotics Inventory
                </div>
            </div>
            <button class="toast-close-btn" title="Dismiss">
                <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
            <div class="welcome-progress-track">
                <div class="welcome-progress-fill"></div>
            </div>
        `;

        const letterEl = toast.querySelector<HTMLElement>('.welcome-avatar-letter');
        if (letterEl) letterEl.textContent = initial;
        const rolePill = toast.querySelector<HTMLElement>('.welcome-role-pill');
        if (rolePill) rolePill.textContent = displayRole;
        const nameEl = toast.querySelector<HTMLElement>('.welcome-highlight-name');
        if (nameEl) nameEl.textContent = userName;

        toast.querySelector('.toast-close-btn')!.addEventListener('click', () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 350);
        });

        this.container.appendChild(toast);
        renderLucideIcons(toast);

        requestAnimationFrame(() => {
            setTimeout(() => toast.classList.add('show'), 20);
        });

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                toast.classList.add('hide');
                setTimeout(() => toast.remove(), 350);
            }
        }, 5500);
    }
}

// ==========================================
// 2. High-Performance Background Engine
// ==========================================
class Background3D {
    private canvas: HTMLCanvasElement;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;

    private particles!: THREE.Points;
    private particlePhases: Float32Array = new Float32Array(0);
    private currentTheme = 'mono';

    private mouseX = 0;
    private mouseY = 0;
    private targetCameraX = 0;
    private targetCameraY = 4;
    private lastFrameTime = 0;
    private readonly frameInterval = 1000 / 30;

    constructor() {
        this.canvas = document.getElementById('canvas-3d') as HTMLCanvasElement;
        if (!this.canvas) return;
        this.init();
        this.createLighting();
        this.createParticles();
        this.setupEvents();
        this.animate();
    }

    private init() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0d0d0c, 0.015);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 4, 18);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
    }

    private createLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xf5f5f2, 1.2, 100);
        pointLight.position.set(0, 10, -20);
        this.scene.add(pointLight);

        const pointLight2 = new THREE.PointLight(0x9c78ed, 1.0, 100);
        pointLight2.position.set(20, 5, 10);
        this.scene.add(pointLight2);
    }

    public updateThemeColors(theme: string) {
        this.currentTheme = theme;
        this.setParticleColorsForTheme(theme);
    }

    private setParticleColorsForTheme(theme: string) {
        if (!this.particles) return;
        const colors = this.particles.geometry.attributes.color.array as Float32Array;
        const count = colors.length / 3;

        // Precalculated RGB normalized floats - zero heap allocations in loop
        const r1 = theme === 'light' ? 0.6117 : 0.451;
        const g1 = theme === 'light' ? 0.4705 : 0.451;
        const b1 = theme === 'light' ? 0.9294 : 0.451;

        const r2 = theme === 'light' ? 0.9607 : 0.9607;
        const g2 = theme === 'light' ? 0.7215 : 0.9607;
        const b2 = theme === 'light' ? 0.9215 : 0.949;

        for (let i = 0; i < count; i++) {
            const ratio = Math.random();
            colors[i * 3] = r1 + (r2 - r1) * ratio;
            colors[i * 3 + 1] = g1 + (g2 - g1) * ratio;
            colors[i * 3 + 2] = b1 + (b2 - b1) * ratio;
        }

        this.particles.geometry.attributes.color.needsUpdate = true;
    }

    private createParticles() {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const particleCount = isMobile ? 60 : 250;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        this.particlePhases = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 120;
            positions[i * 3 + 1] = Math.random() * 40 - 10;
            positions[i * 3 + 2] = (Math.random() - 0.7) * 150;
            this.particlePhases[i] = Math.random() * Math.PI * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: isMobile ? 0.20 : 0.24,
            vertexColors: true,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
        this.setParticleColorsForTheme(this.currentTheme);
    }

    private setupEvents() {
        window.addEventListener('mousemove', (e) => {
            if (window.innerWidth < 768) return;
            this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
        }, { passive: true });

        let lastWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
        window.addEventListener('resize', () => {
            if (Math.abs(window.innerWidth - lastWidth) < 4) return;
            lastWidth = window.innerWidth;

            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            const isMobile = window.innerWidth < 768;
            this.renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
        }, { passive: true });
    }

    private animate() {
        requestAnimationFrame(() => this.animate());
        if (typeof document !== 'undefined' && document.hidden) return;

        // In Midnight Mono, canvas-3d is hidden. Skip rendering completely to eliminate GPU/CPU overhead!
        if (this.currentTheme === 'mono') return;
        if (this.canvas && this.canvas.offsetParent === null && window.getComputedStyle(this.canvas).display === 'none') return;

        const isScrolling = !!(window as any).isUserScrolling;
        if (isScrolling) {
            return;
        }

        const now = performance.now();
        const delta = now - this.lastFrameTime;
        if (delta < this.frameInterval) return;
        this.lastFrameTime = now - (delta % this.frameInterval);

        if (this.particles) {
            const positions = this.particles.geometry.attributes.position.array as Float32Array;
            const particleCount = positions.length / 3;

            for (let i = 0; i < particleCount; i++) {
                positions[i * 3 + 1] += 0.015;
                positions[i * 3 + 2] += 0.03;

                if (positions[i * 3 + 1] > 30) {
                    positions[i * 3 + 1] = -5;
                }
                if (positions[i * 3 + 2] > 20) {
                    positions[i * 3 + 2] = -120;
                    positions[i * 3] = (Math.random() - 0.5) * 120;
                }
            }
            this.particles.geometry.attributes.position.needsUpdate = true;
        }

        this.targetCameraX = this.mouseX * 3;
        this.targetCameraY = 4 + (this.mouseY * 1.5);

        this.camera.position.x += (this.targetCameraX - this.camera.position.x) * 0.05;
        this.camera.position.y += (this.targetCameraY - this.camera.position.y) * 0.05;

        this.camera.lookAt(0, -1, -5);

        this.renderer.render(this.scene, this.camera);
    }
}

// ==========================================
// 3. Database Manager & Supabase Realtime Auto-Sync
// ==========================================
class DatabaseManager {
    static init() {
        // Enforce clean fresh start across all browsers and users
        const CURRENT_STATE_EPOCH = 'cicr_v10_all_returned_restocked';
        if (localStorage.getItem('cicr_fresh_epoch') !== CURRENT_STATE_EPOCH) {
            localStorage.removeItem('cicr_requests');
            localStorage.removeItem('cicr_logs');
            localStorage.removeItem('cicr_inventory');
            localStorage.removeItem('cicr_dismissed_requests');
            localStorage.removeItem('cicr_pending_returns');
            localStorage.removeItem('cicr_read_notifs');
            localStorage.removeItem('cicr_cart_items');
            localStorage.setItem('cicr_notifs_cleared', 'true');
            localStorage.setItem('cicr_fresh_epoch', CURRENT_STATE_EPOCH);
            DatabaseManager.isNotificationsCleared = true;
            inventory = [];
            logs = [];
            requests = [];
            if (typeof AdminManager !== 'undefined') {
                AdminManager.hardwareRequests = [];
                AdminManager.userHardwareRequests = [];
            }
            if ((window as any).dashboard) {
                (window as any).dashboard.renderStats();
            }
        }

        const storedInventory = localStorage.getItem('cicr_inventory');
        if (storedInventory) {
            try {
                inventory = JSON.parse(storedInventory);
                inventory.forEach((item: any) => {
                    const nm = (item.name || '').toLowerCase();
                    if (nm.includes('model unclear') || nm === 'arduino board') {
                        item.name = 'Arduino Uno R3';
                    }
                    const total = Number(item.quantity) || 0;
                    const avail = (item.availableQuantity !== undefined && item.availableQuantity !== null)
                        ? Number(item.availableQuantity)
                        : total;
                    if (avail >= total && Array.isArray(item.borrowedBy)) {
                        item.borrowedBy.forEach((b: any) => {
                            b.returned = true;
                            b.status = 'RETURNED';
                        });
                    }
                    if (Array.isArray(item.borrowedBy)) {
                        item.borrowedBy = item.borrowedBy.filter((b: any) => !b.returned && b.status !== 'RETURNED');
                    }
                });
            } catch {
                inventory = [];
            }
        } else {
            inventory = [];
        }

        const storedLogs = localStorage.getItem('cicr_logs');
        if (storedLogs) {
            try {
                logs = JSON.parse(storedLogs);
            } catch {
                logs = [];
            }
        } else {
            logs = [];
        }

        const storedRequests = localStorage.getItem('cicr_requests');
        if (storedRequests) {
            try {
                const parsed = JSON.parse(storedRequests);
                requests = (parsed || []).filter((r: any) =>
                    Boolean(r && (r.id || r.itemId || r.itemName))
                );
                localStorage.setItem('cicr_requests', JSON.stringify(requests));
            } catch {
                requests = [];
                localStorage.removeItem('cicr_requests');
            }
        } else {
            requests = [];
        }

        // Immediately auto-sync with Supabase backend without delay
        this.syncFromBackend();
        this.updateNotificationBadges();
    }

    static async syncFromBackend() {
        try {
            const token = localStorage.getItem('cicr_token');
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // Fetch public inventory catalog items (strictly lazy-load audit, history & users on-demand)
            const itemsRes = await fetch(`${API_BASE}/items`, { headers });
            let dbItems: any[] = [];
            if (itemsRes.ok) {
                try {
                    const json = await itemsRes.json();
                    dbItems = json.data || [];
                } catch { }
            }

            // Fetch active loans from backend to sync return buttons and active loans
            let dbActiveLoans: any[] = [];
            if (token) {
                try {
                    const role = ModalManager.getCurrentRole();
                    const loansEndpoint = role === 'ADMIN' ? `${API_BASE}/borrow/ledger?force=true` : `${API_BASE}/borrow/history?force=true`;
                    const loansRes = await fetch(loansEndpoint, { headers });
                    if (loansRes.ok) {
                        const loansJson = await loansRes.json();
                        dbActiveLoans = Array.isArray(loansJson.data) ? loansJson.data : [];
                        if (typeof ProfileViewManager !== 'undefined' && dbActiveLoans.length > 0) {
                            ProfileViewManager.cachedHistory = dbActiveLoans;
                        }
                    }
                } catch (e) {
                    console.warn('[DatabaseManager] Loans sync notice:', e);
                }
            }

            if (dbItems.length > 0) {
                // Map inventory items with available_quantity computed canonically by backend
                inventory = dbItems.map((item: any) => {
                    let cat = (item.category || '').toLowerCase();
                    if (cat.includes('controller') || cat.includes('mcu') || cat.includes('board') || cat.includes('programmer')) cat = 'microcontrollers';
                    else if (cat.includes('sensor')) cat = 'sensors';
                    else if (cat.includes('actuator') || cat.includes('motor') || cat.includes('esc') || cat.includes('servo') || cat.includes('driver')) cat = 'actuators';
                    else if (cat.includes('power') || cat.includes('battery') || cat.includes('charge') || cat.includes('supply')) cat = 'power';
                    else if (cat.includes('tool') || cat.includes('comm') || cat.includes('display') || cat.includes('remote') || cat.includes('cable') || cat.includes('mechanical') || cat.includes('misc')) cat = 'tools';

                    const totalQty = Number(item.quantity) || 0;
                    const availableQty = (item.available_quantity !== undefined && item.available_quantity !== null)
                        ? Math.min(totalQty, Math.max(0, Number(item.available_quantity)))
                        : totalQty;

                    let cleanName = (item.name || '').trim();
                    if (cleanName.toLowerCase().includes('model unclear') || cleanName.toLowerCase() === 'arduino board') {
                        cleanName = 'Arduino Uno R3';
                    }

                    const existingItem = inventory.find(i => String(i.id) === String(item.id));

                    // Map server active loans for this item (strictly active loans only)
                    const itemActiveLoans: BorrowRecord[] = availableQty >= totalQty ? [] : dbActiveLoans
                        .filter((rec: any) =>
                            String(rec.inventory_id || rec.inventory?.id) === String(item.id) &&
                            rec.status !== 'RETURNED' &&
                            !rec.returned &&
                            !rec.returned_at
                        )
                        .map((rec: any) => {
                            const isPendingRet = (requests || []).some(
                                (r: any) => r.status === 'PENDING' && r.type === 'RETURN' && (String(r.borrowId || (r as any).borrow_id) === String(rec.id) || (String(r.itemId || (r as any).inventory_id) === String(item.id) && ModalManager.isUserRequestMatch(r)))
                            );
                            return {
                                id: rec.id,
                                name: rec.borrower_name || rec.users?.name || 'Member',
                                userName: rec.borrower_name || rec.users?.name || 'Member',
                                borrowerName: rec.borrower_name || rec.users?.name || 'Member',
                                roll: rec.roll_number || rec.users?.roll_number || '',
                                userRoll: rec.roll_number || rec.users?.roll_number || '',
                                email: rec.borrower_email || rec.users?.email || '',
                                userEmail: rec.borrower_email || rec.users?.email || '',
                                userId: rec.user_id,
                                qty: Number(rec.quantity) || 1,
                                purpose: rec.purpose || 'Active Loan',
                                date: rec.borrowed_at || new Date().toISOString(),
                                dueDate: rec.due_date || null,
                                status: isPendingRet ? 'RETURN_REQUESTED' : rec.status,
                                returned: false
                            };
                        });

                    const existingLoans = availableQty >= totalQty ? [] : (existingItem?.borrowedBy || []).filter(
                        (ex: any) => !ex.returned && ex.status !== 'RETURNED' && ex.status !== 'REJECTED'
                    );
                    const mergedBorrowedBy = [...itemActiveLoans];
                    for (const ex of existingLoans) {
                        const existingMatch = mergedBorrowedBy.find(m => m.id === ex.id);
                        if (existingMatch) {
                            if ((ex as any).status === 'RETURN_REQUESTED') {
                                (existingMatch as any).status = 'RETURN_REQUESTED';
                            }
                        } else {
                            mergedBorrowedBy.push(ex);
                        }
                    }

                    return {
                        id: String(item.id),
                        name: cleanName,
                        category: cat || 'microcontrollers',
                        quantity: totalQty,
                        availableQuantity: availableQty,
                        location: item.location || 'Lab Shelf',
                        specs: item.description || 'No specifications provided.',
                        image: item.image || (cat === 'sensors' ? 'drone.jpg' : cat === 'actuators' || cat === 'power' ? 'rover.jpg' : 'microchip.jpg'),
                        tags: Array.isArray(item.tags) ? item.tags : typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : [],
                        borrowedBy: mergedBorrowedBy
                    };
                });

                // Save to localStorage cache
                this.save();
            }

            if (window.dashboard && dbItems.length > 0) {
                window.dashboard.renderStats();
                if ((window as any).isUserScrolling) {
                    (window as any)._pendingDashboardRender = true;
                } else {
                    window.dashboard.renderInventory(true);
                }
            }
        } catch (err) {
            console.error('Realtime Supabase sync failed:', err);
        } finally {
            this.updateNotificationBadges();
        }
    }

    static save() {
        localStorage.setItem('cicr_inventory', JSON.stringify(inventory));
        localStorage.setItem('cicr_logs', JSON.stringify(logs));
        localStorage.setItem('cicr_requests', JSON.stringify(requests));
        this.updateNotificationBadges();
    }

    static isNotificationsCleared: boolean = false;

    static updateNotificationBadges() {
        const todayStr = new Date().toISOString().split('T')[0];
        const role = ModalManager.getCurrentRole();
        const isAdmin = role === 'ADMIN';

        const isUserLoan = (rec: BorrowRecord) => ModalManager.isUserLoanMatch(rec);
        const isUserRequest = (req: any) => ModalManager.isUserRequestMatch(req);

        let overdueCount = 0;
        let activeLoansCount = 0;
        let depletedStockCount = 0;

        inventory.forEach((item) => {
            const total = Number(item.quantity) || 0;
            const available = typeof item.availableQuantity === 'number'
                ? item.availableQuantity
                : total;

            // Only count as critical stock alert if item is completely depleted (0 available out of >0 total)
            if (isAdmin && available <= 0 && total > 0) {
                depletedStockCount++;
            }

            (item.borrowedBy || []).forEach((rec) => {
                if (rec.returned) return;

                const belongsToUser = isUserLoan(rec);
                if (!isAdmin && !belongsToUser) return;

                activeLoansCount++;

                let due = rec.dueDate;
                if (!due && rec.date) {
                    const bTime = new Date(rec.date).getTime();
                    if (!isNaN(bTime)) {
                        due = new Date(bTime + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    }
                }
                if (due && due < todayStr) {
                    overdueCount++;
                }
            });
        });

        // Collect all user hardware requests from all available caches
        const userReqMap = new Map<string, any>();
        const dismissedRaw = localStorage.getItem('cicr_dismissed_requests');
        const dismissedSet: Set<string> = dismissedRaw ? new Set(JSON.parse(dismissedRaw)) : new Set();

        const addReq = (r: any) => {
            if (!r) return;
            const status = (r.status || 'PENDING').toUpperCase();
            if (status === 'PENDING' && (dismissedSet.has(r.id) || (r.borrowId && dismissedSet.has(r.borrowId)))) {
                return;
            }
            const isReturn = r.type === 'RETURN' || Boolean(r.borrowId);
            const borrowerKey = (r.borrowerEmail || r.email || r.roll || r.rollNumber || r.name || r.borrowerName || '').toLowerCase().trim();
            const itemKey = (r.itemId || r.itemName || '').toLowerCase().trim();
            const qtyKey = Number(r.quantity || r.qty) || 1;
            const purpKey = (r.purpose || '').toLowerCase().trim();
            const key = isReturn
                ? `ret__${(r.borrowId || r.id || '').trim().toLowerCase()}`
                : `iss__${borrowerKey}__${itemKey}__${qtyKey}__${purpKey}`;

            const reqKey = key || String(r.id || Math.random());
            if (userReqMap.has(reqKey)) {
                const existing = userReqMap.get(reqKey);
                const existingStatus = (existing.status || 'PENDING').toUpperCase();
                if (existingStatus === 'PENDING' && (status === 'APPROVED' || status === 'REJECTED')) {
                    userReqMap.set(reqKey, r);
                }
                return;
            }
            userReqMap.set(reqKey, r);
        };

        if (isAdmin) {
            if (typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.hardwareRequests)) {
                AdminManager.hardwareRequests.forEach(addReq);
            }
            (requests || []).forEach(addReq);
        } else {
            if (typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.userHardwareRequests)) {
                AdminManager.userHardwareRequests.forEach(r => {
                    if (r && isUserRequest(r)) addReq(r);
                });
            }
            (requests || []).forEach(r => {
                if (r && isUserRequest(r)) addReq(r);
            });
        }

        const storedReqRaw = localStorage.getItem('cicr_requests');
        if (storedReqRaw) {
            try {
                const parsed = JSON.parse(storedReqRaw);
                (parsed || []).forEach((r: any) => {
                    if (isAdmin || isUserRequest(r)) addReq(r);
                });
            } catch { }
        }

        if (typeof HardwareLedgerManager !== 'undefined' && typeof HardwareLedgerManager.getRecords === 'function') {
            const records = HardwareLedgerManager.getRecords();
            if (Array.isArray(records)) {
                records.forEach((rec: any) => {
                    if (!rec) return;
                    const isRet = rec.action_type === 'RETURNED' || Boolean(rec.return_date) || rec.status === 'RETURNED';
                    const isPend = rec.action_type === 'PENDING_APPROVAL' || rec.status === 'PENDING';
                    const statusVal = isPend ? 'PENDING' : (rec.status === 'REJECTED' ? 'REJECTED' : 'APPROVED');
                    const mappedReq = {
                        id: rec.id,
                        type: isRet ? 'RETURN' : 'ISSUE',
                        borrowId: isRet ? rec.id : undefined,
                        itemId: rec.component_id,
                        itemName: rec.component_name,
                        borrowerName: rec.borrower_name,
                        borrowerEmail: rec.borrower_email,
                        rollNumber: rec.borrower_roll,
                        status: statusVal
                    };
                    if (isAdmin || isUserRequest(mappedReq)) addReq(mappedReq);
                });
            }
        }

        const allUserReqs: any[] = Array.from(userReqMap.values());
        const pendingCount = allUserReqs.filter(r => r.status === 'PENDING').length;

        const isLoggedIn = Boolean(localStorage.getItem('cicr_token') || localStorage.getItem('cicr_auth'));

        const isCleared = this.isNotificationsCleared || localStorage.getItem('cicr_notifs_cleared') === 'true';
        const effectivePending = isCleared ? 0 : pendingCount;

        const sidebarBadge = document.getElementById('sidebar-notif-badge');
        const sidebarBeacon = document.getElementById('sidebar-notif-beacon') || (document.querySelector('.notif-radar-beacon') as HTMLElement | null);
        const navBadge = document.getElementById('nav-bell-badge');

        const sidebarTitle = document.getElementById('sidebar-notif-title');
        const sidebarSubtext = document.getElementById('sidebar-notif-subtext');

        if (!isLoggedIn) {
            if (sidebarTitle) sidebarTitle.innerText = 'Review Request';
            if (sidebarSubtext) {
                sidebarSubtext.innerText = 'Track Requests';
                sidebarSubtext.title = 'Track Requests';
                sidebarSubtext.className = 'btn-subtext subtext-neutral';
            }
        } else if (isAdmin) {
            if (sidebarTitle) sidebarTitle.innerText = 'Review Request';
            if (sidebarSubtext) {
                sidebarSubtext.innerText = 'All User Requests';
                sidebarSubtext.title = 'All User Requests';
                sidebarSubtext.className = 'btn-subtext subtext-neutral';
            }
        } else {
            if (sidebarTitle) sidebarTitle.innerText = 'Review Request';
            if (sidebarSubtext) {
                sidebarSubtext.innerText = 'My Requests & Logs';
                sidebarSubtext.title = 'My Requests & Logs';
                sidebarSubtext.className = 'btn-subtext subtext-neutral';
            }
        }

        if (effectivePending > 0) {
            const alertStr = String(effectivePending);
            if (sidebarBadge) {
                if (sidebarBadge.innerText !== alertStr) sidebarBadge.innerText = alertStr;
                if (sidebarBadge.style.display !== 'inline-flex') sidebarBadge.style.display = 'inline-flex';
                if (!sidebarBadge.classList.contains('pulse')) sidebarBadge.classList.add('pulse');
            }
            if (sidebarBeacon) {
                if (sidebarBeacon.style.display !== 'block') sidebarBeacon.style.display = 'block';
            }
            if (navBadge) {
                if (navBadge.innerText !== alertStr) navBadge.innerText = alertStr;
                if (navBadge.style.display !== 'inline-flex') navBadge.style.display = 'inline-flex';
            }
        } else {
            if (sidebarBadge) {
                sidebarBadge.style.display = 'none';
                sidebarBadge.innerText = '0';
            }
            if (sidebarBeacon) sidebarBeacon.style.display = 'none';
            if (navBadge) {
                navBadge.style.display = 'none';
                navBadge.innerText = '0';
            }
        }

        if (typeof NotificationCenterManager !== 'undefined' && typeof NotificationCenterManager.updateNotifications === 'function') {
            NotificationCenterManager.updateNotifications();
        }
    }

    private static isSyncInProgress = false;

    static startAutoSync(intervalMs = 45000) {
        if ((window as any)._cicrAutoSyncTimer) {
            clearInterval((window as any)._cicrAutoSyncTimer);
        }
        (window as any)._cicrAutoSyncTimer = setInterval(async () => {
            // Do not hammer backend when tab is hidden or user is actively scrolling
            if (typeof document !== 'undefined' && document.hidden) return;
            if (this.isSyncInProgress) return;
            if ((window as any).isUserScrolling) return;

            this.isSyncInProgress = true;
            try {
                await this.syncFromBackend();
                const role = ModalManager.getCurrentRole();
                if (role === 'ADMIN' && typeof AdminManager !== 'undefined' && document.body.classList.contains('view-admin-view')) {
                    await AdminManager.loadHardwareRequests();
                }
                this.updateNotificationBadges();
            } catch (syncErr) {
                console.warn('Background sync cycle warning:', syncErr);
            } finally {
                this.isSyncInProgress = false;
            }
        }, intervalMs);
    }

    static addLog(type: ActivityLog['type'], text: string, itemId?: string) {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        logs.unshift({ type, timestamp, text });
        this.save();

        // Asynchronously persist to backend 7-day audit ledger
        const token = localStorage.getItem('cicr_token');
        if (token) {
            let action = 'System Event';
            if (type === 'borrow') action = 'Borrowed';
            else if (type === 'return') action = 'Returned';
            else if (type === 'add') action = 'Item Added';
            else if (type === 'approve') action = 'Hardware Approved';
            else if (type === 'reject') action = 'Hardware Rejected';
            else if (type === 'request') action = 'Hardware Requested';
            else if (type === 'low_stock') action = 'Stock Alert';

            const plainText = text.replace(/<[^>]*>?/gm, '');
            fetch(`${API_BASE}/audit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action,
                    description: plainText,
                    itemId: itemId || null
                })
            }).catch(() => {});
        }
    }
}

// ==========================================
// 4. Dashboard Manager Class
// ==========================================
class DashboardManager {
    private activeCategory = 'all';
    public searchQuery = '';
    public lastRenderedFingerprint = '';
    private listenersInitialized = false;
    private mobileSidebarOpen = false;

    private appContainer: HTMLElement;
    private inventoryGrid: HTMLElement;
    private noResults: HTMLElement;
    private searchInput: HTMLInputElement;
    private clearSearchBtn: HTMLElement;
    private resultsCount: HTMLElement;

    private statTotal: HTMLElement;
    private statAvailable: HTMLElement | null;
    private statBorrowed: HTMLElement;
    private statLow: HTMLElement;
    private statOut: HTMLElement;
    private mobileSidebarToggle: HTMLButtonElement | null;
    private mobileSidebarBackdrop: HTMLElement | null;

    public activeStockFilter: 'all' | 'available' | 'borrowed' | 'low' | 'out' = 'all';
    private activeStockPill: HTMLElement | null = null;

    private clockTimerId: any = null;

    constructor() {
        this.appContainer = document.getElementById('app-container')!;
        this.mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle') as HTMLButtonElement | null;
        this.mobileSidebarBackdrop = document.getElementById('mobile-sidebar-backdrop');
        this.inventoryGrid = document.getElementById('inventory-grid')!;
        this.noResults = document.getElementById('no-results')!;
        this.searchInput = document.getElementById('search-input') as HTMLInputElement;
        this.clearSearchBtn = document.getElementById('clear-search')!;
        this.resultsCount = document.getElementById('results-count')!;
        this.activeStockPill = document.getElementById('active-stock-pill');

        this.statTotal = document.getElementById('stat-total')!;
        this.statAvailable = document.getElementById('stat-available');
        this.statBorrowed = document.getElementById('stat-borrowed')!;
        this.statLow = document.getElementById('stat-low')!;
        this.statOut = document.getElementById('stat-out')!;

        this.init();
        this.loadInventory();
    }

    public init() {
        this.renderStats();
        this.renderInventory();
        if (typeof CartManager !== 'undefined') {
            CartManager.init();
        }
        AuthManager.updateAdminVisibility(ModalManager.getCurrentRole());
        if (!this.listenersInitialized) {
            this.setupEventListeners();
            this.listenersInitialized = true;
        }
    }

    static formatLogDateTime(raw: string | Date | undefined): { dateStr: string; timeStr: string } {
        if (!raw) {
            const now = new Date();
            return {
                dateStr: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                timeStr: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/\u202f/g, ' ').toUpperCase()
            };
        }

        let d: Date | null = null;
        const s = String(raw).trim();
        const hasTime = s.includes(':');

        if (raw instanceof Date) {
            d = raw;
        } else if (hasTime) {
            const isoCandidate = s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s;
            const parsed = new Date(isoCandidate);
            if (!isNaN(parsed.getTime())) {
                d = parsed;
            }
        }

        if (d && !isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }); // e.g. "13 Sep 2026"
            const timeStr = d.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).replace(/\u202f/g, ' ').toUpperCase(); // e.g. "03:13 PM"
            return { dateStr, timeStr };
        }

        // Check if date-only format YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            const [year, month, day] = s.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const mIdx = parseInt(month, 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
                return {
                    dateStr: `${parseInt(day, 10)} ${monthNames[mIdx]} ${year}`,
                    timeStr: ''
                };
            }
        }

        // Fallback for strings with T or space
        if (s.includes('T') || s.includes(' ')) {
            const sep = s.includes('T') ? 'T' : ' ';
            const [datePart, timePart] = s.split(sep);
            let formattedDate = datePart;
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                const [year, month, day] = datePart.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const mIdx = parseInt(month, 10) - 1;
                if (mIdx >= 0 && mIdx < 12) {
                    formattedDate = `${parseInt(day, 10)} ${monthNames[mIdx]} ${year}`;
                }
            }
            return {
                dateStr: formattedDate || s,
                timeStr: timePart ? timePart.slice(0, 5) : ''
            };
        }

        return { dateStr: s, timeStr: '' };
    }

    public setMobileSidebar(open: boolean) {
        const shouldOpen = open && window.innerWidth <= 1100;
        this.mobileSidebarOpen = shouldOpen;
        this.appContainer.classList.toggle('sidebar-open', shouldOpen);
        this.mobileSidebarToggle?.setAttribute('aria-expanded', String(shouldOpen));
        document.body.style.overflow = shouldOpen ? 'hidden' : '';
    }

    private startClock() {
        if (this.clockTimerId) clearInterval(this.clockTimerId);

        const clockEl = document.getElementById('dashboard-clock');
        const dateEl = document.getElementById('dashboard-date');
        const greetingEl = document.getElementById('dashboard-greeting');
        let lastDateStr = '';
        let lastGreetingStr = '';

        const updateTime = () => {
            const now = new Date();

            // Format time: hh:mm:ss am/pm
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            const formattedHours = String(hours).padStart(2, '0');
            const timeStr = `${formattedHours}:${minutes}:${seconds} ${ampm}`;

            if (clockEl && clockEl.textContent !== timeStr) {
                clockEl.textContent = timeStr;
            }

            // Update date only when changed
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
            if (dateStr !== lastDateStr) {
                lastDateStr = dateStr;
                if (dateEl) dateEl.textContent = dateStr;
            }

            // Update time-of-day greeting only when hour or user changes
            const curHour = now.getHours();
            let timeOfDay = 'evening';
            if (curHour < 12) {
                timeOfDay = 'morning';
            } else if (curHour < 17) {
                timeOfDay = 'afternoon';
            }

            const username = localStorage.getItem('cicr_auth') || 'Operator';
            const greetingStr = `Good ${timeOfDay}, ${username}`;
            if (greetingStr !== lastGreetingStr) {
                lastGreetingStr = greetingStr;
                if (greetingEl) greetingEl.textContent = greetingStr;
            }
        };

        updateTime();
        this.clockTimerId = setInterval(updateTime, 1000);
    }

    private setupEventListeners() {
        // Ticking Clock and dynamic greeting initialization
        this.startClock();

        const closeMobileSidebar = () => this.setMobileSidebar(false);
        const toggleMobileSidebar = () => this.setMobileSidebar(!this.mobileSidebarOpen);

        this.mobileSidebarToggle?.addEventListener('click', () => {
            toggleMobileSidebar();
        });

        this.mobileSidebarBackdrop?.addEventListener('click', () => {
            closeMobileSidebar();
        });

        const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
        sidebarCloseBtn?.addEventListener('click', () => {
            closeMobileSidebar();
        });

        const sidebarResetPassBtn = document.getElementById('sidebar-reset-pass-btn');
        sidebarResetPassBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeMobileSidebar();
            PasswordResetManager.open();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 1100) {
                closeMobileSidebar();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMobileSidebar();

                // Close notification dropdown
                const notifDropdown = document.getElementById('header-notif-dropdown');
                if (notifDropdown && notifDropdown.style.display !== 'none') {
                    notifDropdown.style.display = 'none';
                    document.getElementById('header-notif-btn')?.setAttribute('aria-expanded', 'false');
                }

                // Close all active modals
                ModalManager.closeAll();

                const signoutModal = document.getElementById('signout-confirm-modal');
                if (signoutModal && signoutModal.classList.contains('active')) {
                    signoutModal.style.opacity = '0';
                    setTimeout(() => {
                        signoutModal.classList.remove('active');
                        signoutModal.style.display = 'none';
                    }, 250);
                }
            }

            // Press '/' to search catalog when not typing in an input/textarea and no modal is active
            if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
                const anyModalActive = document.querySelector('.modal-overlay.active');
                if (!anyModalActive) {
                    e.preventDefault();
                    if ((window as any).switchSection) {
                        (window as any).switchSection('inventory-view');
                    }
                    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    }
                }
            }
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        // 1. Sidebar Nav click listeners
        const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
        const sections = document.querySelectorAll('#app-main-content > section');
        const breadcrumbActive = document.getElementById('breadcrumb-current');

        const switchSection = (targetId: string) => {
            sections.forEach(node => {
                const sec = node as HTMLElement;
                sec.style.removeProperty('display');
                if (sec.id === targetId) {
                    sec.classList.add('active');
                    sec.style.display = (sec.id === 'admin-view' || sec.id === 'dashboard-view') ? 'flex' : 'block';
                } else {
                    sec.classList.remove('active');
                    sec.style.display = 'none';
                }
            });

            // Toggle body classes for current view
            document.body.classList.toggle('view-dashboard-view', targetId === 'dashboard-view');
            document.body.classList.toggle('view-developers-view', targetId === 'developers-view');
            document.body.classList.toggle('view-profile-view', targetId === 'profile-view');
            document.body.classList.toggle('view-admin-view', targetId === 'admin-view');
            document.body.classList.toggle('view-inventory-view', targetId === 'inventory-view');
            document.body.classList.toggle('view-hardware-logs-view', targetId === 'hardware-logs-view');

            // Top navbar cart button is visible STRICTLY on the inventory page
            const headerCartWrapper = document.querySelector('.header-cart-wrapper') as HTMLElement | null;
            if (headerCartWrapper) {
                headerCartWrapper.style.display = (targetId === 'inventory-view') ? 'inline-flex' : 'none';
            }

            // Sync floating cart capsule FAB (strictly on inventory page)
            const floatingFab = document.getElementById('floating-cart-fab');
            if (floatingFab) {
                floatingFab.style.display = (targetId === 'inventory-view') ? 'block' : 'none';
            }

            // Refresh Lucide icons efficiently without re-parsing whole DOM
            renderLucideIcons();

            // Update sidebar link active class
            sidebarLinks.forEach(link => {
                const target = (link as HTMLElement).dataset.target;
                if (target === targetId) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            // Auto-expand parent section if it's currently collapsed so active link is visible
            const currentActiveLink = document.querySelector(`.sidebar-nav-link[data-target="${targetId}"]`);
            if (currentActiveLink) {
                const parentSection = currentActiveLink.closest('.sidebar-section');
                if (parentSection && parentSection.classList.contains('is-collapsed')) {
                    parentSection.classList.remove('is-collapsed');
                    const hdr = parentSection.querySelector('.sidebar-section-header');
                    if (hdr) hdr.setAttribute('aria-expanded', 'true');
                }
            }

            // Update breadcrumbs text
            if (breadcrumbActive) {
                const nameMap: Record<string, string> = {
                    'dashboard-view': 'DASHBOARD',
                    'projects-view': 'PROJECTS',
                    'meetings-view': 'MEETINGS',
                    'events-view': 'EVENTS',
                    'inventory-view': 'INVENTORY',
                    'hardware-logs-view': 'LOGS',
                    'developers-view': 'MEET THE DEVELOPERS',
                    'profile-view': 'MY PROFILE',
                    'admin-view': 'ADMIN MANAGEMENT'
                };
                breadcrumbActive.textContent = nameMap[targetId] || targetId.toUpperCase();
            }

            // If switching to inventory-view, trigger render/refresh
            if (targetId === 'inventory-view') {
                this.renderInventory();
            }

            // If switching to admin-view, load admin data (ADMIN ONLY)
            if (targetId === 'admin-view') {
                if (ModalManager.getCurrentRole() !== 'ADMIN') {
                    ToastManager.show('Access Restricted', 'Admin privileges required to access Admin Portal.', 'warning');
                    switchSection('dashboard-view');
                    return;
                }
                AdminManager.loadUsers(true);
                AdminManager.loadHardwareRequests(true);
                AdminManager.loadAuditLogs();
            }

            // If switching to hardware-logs-view, render logs & component history (ADMIN ONLY)
            if (targetId === 'hardware-logs-view') {
                if (ModalManager.getCurrentRole() !== 'ADMIN') {
                    ToastManager.show('Access Restricted', 'Admin privileges required to access Activity Logs.', 'warning');
                    switchSection('dashboard-view');
                    return;
                }
                if (typeof HardwareLedgerManager !== 'undefined') {
                    HardwareLedgerManager.render();
                }
            }

            // If switching to developers-view, render team showcase with Team as default
            if (targetId === 'developers-view') {
                if (typeof TeamShowcaseManager !== 'undefined') {
                    TeamShowcaseManager.init();
                    TeamShowcaseManager.setCategory('team');
                }
            }

            // If switching to profile-view, render aesthetic operator profile HUD
            if (targetId === 'profile-view') {
                if (typeof ProfileViewManager !== 'undefined') {
                    ProfileViewManager.render();
                }
            }

            closeMobileSidebar();
            (window as any).syncFixedSidebarPosition?.();
        };

        (this as any).switchSection = switchSection;
        (window as any).switchSection = switchSection;
        switchSection('dashboard-view');

        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = (link as HTMLElement).dataset.target;
                if (target) {
                    switchSection(target);
                    closeMobileSidebar();
                }
            });
        });

        // Interactive Collapsible Sidebar Sections (CORE WORKSPACE, MISCELLANEOUS)
        const sidebarSectionHeaders = document.querySelectorAll('.sidebar-section-header');
        sidebarSectionHeaders.forEach(header => {
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute('aria-expanded', 'true');

            const toggleSection = () => {
                const section = header.closest('.sidebar-section');
                if (!section) return;
                const isCollapsed = section.classList.toggle('is-collapsed');
                header.setAttribute('aria-expanded', String(!isCollapsed));
            };

            header.addEventListener('click', (e) => {
                e.preventDefault();
                toggleSection();
            });

            header.addEventListener('keydown', (e: Event) => {
                const keyEvent = e as KeyboardEvent;
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                    keyEvent.preventDefault();
                    toggleSection();
                }
            });
        });

        // Interactive Breadcrumb Redirecting Buttons
        const breadcrumbHome = document.getElementById('breadcrumb-home');
        if (breadcrumbHome) {
            breadcrumbHome.addEventListener('click', (e) => {
                e.preventDefault();
                switchSection('dashboard-view');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
        if (breadcrumbActive) {
            breadcrumbActive.addEventListener('click', (e) => {
                e.preventDefault();
                const activeSection = document.querySelector('#app-main-content > section.active');
                if (activeSection) {
                    activeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        // Floating Navbar component logs, developers & profile links
        const navHwLogs = document.getElementById('nav-hardware-logs');
        if (navHwLogs) {
            navHwLogs.addEventListener('click', () => switchSection('hardware-logs-view'));
        }
        const navDevs = document.getElementById('nav-developers');
        if (navDevs) {
            navDevs.addEventListener('click', () => switchSection('developers-view'));
        }
        const navProfile = document.getElementById('nav-profile');
        if (navProfile) {
            navProfile.addEventListener('click', () => switchSection('profile-view'));
        }

        // 2. Dashboard action pills switching listeners
        const pillProjects = document.getElementById('dashboard-pill-projects');
        if (pillProjects) {
            pillProjects.addEventListener('click', () => switchSection('projects-view'));
        }
        const pillMeetings = document.getElementById('dashboard-pill-meetings');
        if (pillMeetings) {
            pillMeetings.addEventListener('click', () => switchSection('meetings-view'));
        }
        const pillEvents = document.getElementById('dashboard-pill-events');
        if (pillEvents) {
            pillEvents.addEventListener('click', () => switchSection('events-view'));
        }
        const pillAdmin = document.getElementById('dashboard-pill-admin');
        if (pillAdmin) {
            pillAdmin.addEventListener('click', () => {
                ModalManager.open('add-item-modal');
            });
        }
        const pillCommunity = document.getElementById('dashboard-pill-community');
        if (pillCommunity) {
            pillCommunity.addEventListener('click', () => {
                ModalManager.openAboutModal();
            });
        }

        // 3. Dashboard card switching listeners
        const cardVault = document.getElementById('dash-card-vault');
        if (cardVault) {
            cardVault.addEventListener('click', () => switchSection('inventory-view'));
        }
        const cardLogs = document.getElementById('dash-card-logs');
        if (cardLogs) {
            cardLogs.addEventListener('click', () => {
                ModalManager.openLogsDrawer();
            });
        }
        const cardHwLogs = document.getElementById('dash-card-hardware-logs');
        if (cardHwLogs) {
            cardHwLogs.addEventListener('click', () => switchSection('hardware-logs-view'));
        }
        const cardDevs = document.getElementById('dash-card-devs');
        if (cardDevs) {
            cardDevs.addEventListener('click', () => switchSection('developers-view'));
        }
        const cardProfile = document.getElementById('dash-card-profile');
        if (cardProfile) {
            cardProfile.addEventListener('click', () => switchSection('profile-view'));
        }
        const cardAdmin = document.getElementById('dash-card-admin');
        if (cardAdmin) {
            cardAdmin.addEventListener('click', () => switchSection('admin-view'));
        }
        const cardProjects = document.getElementById('dash-card-projects');
        if (cardProjects) {
            cardProjects.addEventListener('click', () => switchSection('projects-view'));
        }
        const cardMeetings = document.getElementById('dash-card-meetings');
        if (cardMeetings) {
            cardMeetings.addEventListener('click', () => switchSection('meetings-view'));
        }
        const cardDiscussions = document.getElementById('dash-card-discussions');
        if (cardDiscussions) {
            cardDiscussions.addEventListener('click', () => {
                ModalManager.openAboutModal();
            });
        }
        const cardRecruitment = document.getElementById('dash-card-recruitment');
        if (cardRecruitment) {
            cardRecruitment.addEventListener('click', () => {
                ModalManager.openAboutModal();
            });
        }

        // 4. Notifications & History Drawer trigger
        const notifBtn = document.getElementById('sidebar-notifications-btn');
        if (notifBtn) {
            notifBtn.addEventListener('click', () => {
                closeMobileSidebar();
                const isLoggedIn = Boolean(localStorage.getItem('cicr_token') || localStorage.getItem('cicr_auth'));
                if (!isLoggedIn) {
                    AuthManager.showLoginOverlay();
                    document.getElementById('tab-login-btn')?.click();
                    ToastManager.show('Authentication Required', 'Please sign in to view your hardware requests and approval status.', 'info');
                    return;
                }
                const role = ModalManager.getCurrentRole();
                if (role !== 'ADMIN') {
                    ModalManager.activeNotifTab = 'requests';
                }
                ModalManager.openLogsDrawer();
            });
        }

        // 5. Sidebar profile box click -> Profile view
        const sidebarProfileBox = document.getElementById('sidebar-profile-widget');
        if (sidebarProfileBox) {
            sidebarProfileBox.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('#sidebar-reset-pass-btn')) return;
                switchSection('profile-view');
            });
        }

        // 6. Password Reset / Change Key trigger
        const resetPassBtn = document.getElementById('sidebar-reset-pass-btn');
        if (resetPassBtn && !resetPassBtn.dataset.bound) {
            resetPassBtn.dataset.bound = 'true';
            resetPassBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMobileSidebar();
                PasswordResetManager.open();
            });
        }

        // 6. Profile Logout button
        const logoutBtn = document.getElementById('sidebar-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof AuthManager !== 'undefined' && typeof AuthManager.promptLogout === 'function') {
                    AuthManager.promptLogout();
                } else {
                    const oldLogoutBtn = document.getElementById('nav-logout');
                    if (oldLogoutBtn) {
                        oldLogoutBtn.click();
                    } else {
                        localStorage.removeItem('cicr_auth');
                        window.location.reload();
                    }
                }
            });
        }

        // 7. Inventory Search Input listeners (with 75ms debounce to prevent input lag)
        let searchDebounceTimer: any = null;
        this.searchInput.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            this.clearSearchBtn.style.display = val.trim() ? 'block' : 'none';
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                this.searchQuery = val.toLowerCase().trim();
                this.renderInventory();
            }, 75);
        });

        this.clearSearchBtn.addEventListener('click', () => {
            clearTimeout(searchDebounceTimer);
            this.searchInput.value = '';
            this.searchQuery = '';
            this.clearSearchBtn.style.display = 'none';
            this.renderInventory();
            this.searchInput.focus();
        });

        // 8. Sync active category states between sidebar items and tag pills
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        const tagPills = document.querySelectorAll('.tag-pill');

        const selectCategory = (category: string) => {
            this.activeCategory = category;

            sidebarItems.forEach(item => {
                const itemCat = (item as HTMLElement).dataset.category || 'all';
                if (itemCat === category) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            tagPills.forEach(pill => {
                const pillCat = (pill as HTMLElement).dataset.category || 'all';
                if (pillCat === category) {
                    pill.classList.add('active');
                } else {
                    pill.classList.remove('active');
                }
            });

            this.renderInventory();
        };

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const cat = (item as HTMLElement).dataset.category || 'all';
                selectCategory(cat);
                switchSection('inventory-view');
            });
        });

        tagPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const cat = (pill as HTMLElement).dataset.category || 'all';
                selectCategory(cat);
            });
        });

        // 9. Theme Switcher Buttons listeners
        const themeBtnLight = document.getElementById('theme-btn-light');
        const themeBtnMono = document.getElementById('theme-btn-mono');

        themeBtnLight?.addEventListener('click', () => ThemeManager.applyTheme('light'));
        themeBtnMono?.addEventListener('click', () => ThemeManager.applyTheme('mono'));

        // 10. Interactive Stat Bubbles Filter Listeners (Total, Active Loans, Low Reserves, Out of Stock)
        const statBubbles = document.querySelectorAll('.stat-bubble-new');
        statBubbles.forEach(bubble => {
            bubble.addEventListener('click', () => {
                const target = (bubble as HTMLElement).dataset.stockFilter || 'all';
                if (this.activeStockFilter === target && target !== 'all') {
                    this.activeStockFilter = 'all';
                } else {
                    this.activeStockFilter = target as any;
                }
                this.updateStatBubbleUI();
                this.renderInventory(true);
            });
        });
    }

    public updateStatBubbleUI() {
        const statBubbles = document.querySelectorAll('.stat-bubble-new');
        statBubbles.forEach(bubble => {
            const f = (bubble as HTMLElement).dataset.stockFilter || 'all';
            if (this.activeStockFilter === 'all') {
                bubble.classList.remove('active-filter');
            } else if (f === this.activeStockFilter) {
                bubble.classList.add('active-filter');
            } else {
                bubble.classList.remove('active-filter');
            }
        });

        if (this.activeStockPill) {
            if (this.activeStockFilter === 'all') {
                this.activeStockPill.style.display = 'none';
                this.activeStockPill.innerHTML = '';
            } else {
                const labels: Record<string, string> = {
                    available: 'Vaults Available',
                    borrowed: 'Active Loans',
                    low: 'Low Reserves (≤ 50%)',
                    out: 'Out of Stock'
                };
                const filterText = labels[this.activeStockFilter] || this.activeStockFilter;
                this.activeStockPill.style.display = 'inline-flex';
                this.activeStockPill.innerHTML = `
                    <span class="active-stock-pill-text"><i data-lucide="filter"></i> ${filterText}</span>
                    <button class="btn-clear-stock-filter" title="Clear Stock Filter">✕</button>
                `;
                const clearBtn = this.activeStockPill.querySelector('.btn-clear-stock-filter');
                clearBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.activeStockFilter = 'all';
                    this.updateStatBubbleUI();
                    this.renderInventory(true);
                });
                lucide.createIcons();
            }
        }
    }

    public renderStats() {
        let totalUnits = 0;
        let availableUnits = 0;
        let checkedOutQty = 0;
        let availableItemsCount = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        const role = ModalManager.getCurrentRole();
        const isAdmin = role === 'ADMIN';

        inventory.forEach(item => {
            const total = Number(item.quantity) || 0;
            totalUnits += total;

            const currentAvailable = typeof item.availableQuantity === 'number'
                ? Math.min(total, Math.max(0, item.availableQuantity))
                : total;

            availableUnits += currentAvailable;
            if (currentAvailable > 0) {
                availableItemsCount++;
            }

            // An item can only have active loans if available < total in the vault
            const maxPossibleLoans = Math.max(0, total - currentAvailable);

            // Clean up any stale records if all units are returned in inventory
            if (maxPossibleLoans === 0 && Array.isArray(item.borrowedBy)) {
                item.borrowedBy.forEach((r: any) => {
                    r.returned = true;
                    r.status = 'RETURNED';
                });
            }

            const activeBorrows = (item.borrowedBy || []).filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED');

            if (isAdmin) {
                checkedOutQty += maxPossibleLoans;
            } else {
                const memberLoans = activeBorrows.filter((r: any) => ModalManager.isUserLoanMatch(r));
                checkedOutQty += Math.min(maxPossibleLoans, memberLoans.reduce((sum, rec) => sum + rec.qty, 0));
            }

            const status = getItemStockStatus(item.quantity, currentAvailable);
            if (status.class === 'status-out') {
                outOfStockCount++;
            } else if (status.class === 'status-low') {
                lowStockCount++;
            }
        });

        // Total Vaulted is the total inventory units vaulted (173), Vaults Available is the total units available.
        // Consistency across user and admin accounts per user request ("check 2nd photo..its showing 54 vault in user account..nd 173 in admin acc..fix it")
        const totalStr = String(totalUnits);
        const availableStr = String(availableUnits);
        const borrowedStr = String(checkedOutQty);
        const lowStr = String(lowStockCount);
        const outStr = String(outOfStockCount);

        if (this.statTotal && this.statTotal.innerText !== totalStr) this.statTotal.innerText = totalStr;
        if (this.statAvailable && this.statAvailable.innerText !== availableStr) this.statAvailable.innerText = availableStr;
        if (this.statBorrowed && this.statBorrowed.innerText !== borrowedStr) this.statBorrowed.innerText = borrowedStr;
        if (this.statLow && this.statLow.innerText !== lowStr) this.statLow.innerText = lowStr;
        if (this.statOut && this.statOut.innerText !== outStr) this.statOut.innerText = outStr;
    }

    public renderInventory(force = false) {
        const role = ModalManager.getCurrentRole();
        const isAdmin = role === 'ADMIN';

        const q = this.searchQuery;
        const filtered = inventory.filter(item => {
            if (this.activeCategory !== 'all' && item.category !== this.activeCategory) {
                return false;
            }

            if (q) {
                const matchesSearch = item.name.toLowerCase().includes(q) ||
                    item.specs.toLowerCase().includes(q) ||
                    item.location.toLowerCase().includes(q) ||
                    (Array.isArray(item.tags) && item.tags.some((t: string) => t.toLowerCase().includes(q)));
                if (!matchesSearch) return false;
            }

            const activeBorrows = (item.borrowedBy || []).filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED');
            const borrowedSum = activeBorrows.reduce((sum, rec) => sum + rec.qty, 0);
            const totalQty = Number(item.quantity) || 0;
            const available = typeof item.availableQuantity === 'number'
                ? Math.min(totalQty, Math.max(0, item.availableQuantity))
                : Math.max(0, totalQty - borrowedSum);

            if (this.activeStockFilter === 'available') {
                return available > 0;
            } else if (this.activeStockFilter === 'borrowed') {
                if (isAdmin) {
                    return borrowedSum > 0 || (typeof item.availableQuantity === 'number' && item.availableQuantity < totalQty);
                } else {
                    return activeBorrows.some((r: any) => ModalManager.isUserLoanMatch(r));
                }
            } else if (this.activeStockFilter === 'low') {
                const status = getItemStockStatus(item.quantity, available);
                return status.class === 'status-low';
            } else if (this.activeStockFilter === 'out') {
                const status = getItemStockStatus(item.quantity, available);
                return status.class === 'status-out';
            }

            return true;
        });

        const cartKey = (typeof CartManager !== 'undefined')
            ? CartManager.getItems().map((c: any) => `${c.id}:${c.quantity}`).join(',')
            : '';
        const currentFingerprint = `${role}_${this.activeCategory}_${this.activeStockFilter}_${this.searchQuery}_${cartKey}_` +
            filtered.map(i => `${i.id}_${i.availableQuantity}_${i.quantity}_${i.name}_${i.location}_${(i.borrowedBy || []).map((b: any) => `${b.id}:${b.status}:${b.qty}`).join(',')}`).join('|');

        if (!force && this.lastRenderedFingerprint === currentFingerprint && this.inventoryGrid.children.length === filtered.length) {
            // Inventory data and filters have not changed; do NOT destroy/re-render DOM cards to prevent items popping up repeatedly
            return;
        }

        this.lastRenderedFingerprint = currentFingerprint;

        this.inventoryGrid.innerHTML = '';

        if (filtered.length === 0) {
            this.noResults.style.display = 'flex';
            this.resultsCount.innerText = "Showing 0 items";
            return;
        }

        this.noResults.style.display = 'none';
        const filterSuffix = this.activeStockFilter === 'low' ? ' (Low Reserves)' :
            this.activeStockFilter === 'borrowed' ? ' (Active Loans)' :
                this.activeStockFilter === 'out' ? ' (Out of Stock)' : '';
        this.resultsCount.innerText = `Showing ${filtered.length} component${filtered.length > 1 ? 's' : ''}${filterSuffix}`;

        const totalCountEl = document.getElementById('vault-total-count-text');
        if (totalCountEl) {
            totalCountEl.innerText = String(inventory.length);
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((item) => {
            const card = this.createCardElement(item);
            fragment.appendChild(card);
        });
        this.inventoryGrid.appendChild(fragment);

        // If currently viewing profile, keep active loans & quota updated in real time
        const profileSec = document.getElementById('profile-view');
        if (profileSec && profileSec.classList.contains('active') && typeof ProfileViewManager !== 'undefined') {
            ProfileViewManager.render();
        }
    }

    private async loadInventory() {
        await DatabaseManager.syncFromBackend();
        this.renderInventory(true);
        this.renderStats();
    }

    private createCardElement(item: InventoryItem): HTMLElement {
        const card = document.createElement('div');
        card.className = 'inventory-card active';

        const borrowedSum = (item.borrowedBy || [])
            .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            .reduce((sum: number, rec: any) => sum + rec.qty, 0);
        const totalQty = Number(item.quantity) || 0;
        const available = typeof item.availableQuantity === 'number'
            ? Math.min(totalQty, Math.max(0, item.availableQuantity))
            : Math.max(0, totalQty - borrowedSum);

        const status = getItemStockStatus(totalQty, available);
        const statusText = status.text;
        const statusClass = status.class;

        const catMap: Record<string, string> = {
            microcontrollers: "MCU",
            sensors: "SENSOR",
            actuators: "ACTUATOR",
            power: "POWER",
            tools: "HARDWARE"
        };
        const categoryLabel = catMap[item.category] || item.category.toUpperCase();

        const itemName = item.name;

        // Dynamic 1-line sizing class so longer component names never get hidden or truncated
        const nameLen = itemName.length;
        const titleSizeClass = nameLen > 28 ? 'title-compact-xs' : nameLen > 18 ? 'title-compact-sm' : '';

        // Shorter, punchier description for aesthetic display
        const cleanSpecs = (item.specs || '').trim();
        let shortDesc = cleanSpecs;
        if (shortDesc.length > 56) {
            const cut = shortDesc.substring(0, 54);
            const lastSpace = cut.lastIndexOf(' ');
            shortDesc = (lastSpace > 24 ? cut.substring(0, lastSpace) : cut).trim() + '...';
        }

        // Shorter location label (extracts sub-location e.g. "Rack S1, Box 1")
        let shortLocation = item.location || 'Lab Vault';
        if (shortLocation.includes(' - ')) {
            shortLocation = shortLocation.split(' - ')[1].trim();
        }

        // Mini tech tags (up to 2 clean tags)
        const rawTags = Array.isArray(item.tags) ? item.tags : [];
        const miniTags = rawTags
            .filter((t: string) => !['Sensors', 'Controllers', 'Actuators', 'Power', 'Tools', 'Mechanical'].includes(t))
            .slice(0, 2);
        const miniTagsHtml = miniTags.length > 0 ? `
            <div class="card-tags-row">
                ${miniTags.map((t: string) => `<span class="card-mini-tag">#${AdminManager.escapeHtml(t)}</span>`).join('')}
            </div>
        ` : '';

        // Availability progress percentage (relative to true total quantity)
        const fillPercent = totalQty > 0 ? Math.min(100, Math.round((available / totalQty) * 100)) : 0;

        const isAdmin = ModalManager.getCurrentRole() === 'ADMIN';
        const deleteBtnHtml = isAdmin ? `
            <button class="btn-card-delete-item" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(itemName)}" title="Delete Component from Inventory">
                ${getFastIconSvg('trash-2', 13)}
            </button>
        ` : '';

        const totalBorrowedUnits = Math.max(0, totalQty - available);
        const cleanBorrowedBy = totalBorrowedUnits > 0
            ? (item.borrowedBy || []).filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            : [];
        const myLoans = cleanBorrowedBy.filter((r: any) => (r as any).status !== 'PENDING' && ModalManager.isUserLoanMatch(r));
        const myLoanTotal = myLoans.reduce((sum: number, r: any) => sum + (Number(r.qty) || 0), 0);
        const myPendingReturn = myLoans.some((r: any) => (r as any).status === 'RETURN_REQUESTED');

        let loanBadgeHtml = '';
        if (myLoanTotal > 0) {
            loanBadgeHtml = `
            <div class="card-loan-action-pill" style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; background: ${myPendingReturn ? 'rgba(245, 158, 11, 0.12)' : 'rgba(99, 102, 241, 0.08)'}; border: 1px solid ${myPendingReturn ? 'rgba(245, 158, 11, 0.35)' : 'rgba(99, 102, 241, 0.28)'}; border-radius: 6px; padding: 5px 10px; font-size: 11px; color: ${myPendingReturn ? '#f59e0b' : '#818cf8'}; cursor: pointer; transition: all 0.2s ease;">
                <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600;">
                    ${getFastIconSvg(myPendingReturn ? 'clock' : 'package-check', 12)} ${myPendingReturn ? `Return Pending (${myLoanTotal} issued)` : `You have ${myLoanTotal} issued`}
                </span>
                <span style="font-weight: 700; text-decoration: underline; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 3px;">
                    ${myPendingReturn ? 'View Status' : 'Return'} ${getFastIconSvg(myPendingReturn ? 'arrow-right' : 'corner-up-left', 11)}
                </span>
            </div>
            `;
        } else if (isAdmin && totalBorrowedUnits > 0) {
            loanBadgeHtml = `
            <div class="card-admin-loan-pill" style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; font-size: 11px; cursor: pointer; transition: all 0.2s ease;" title="Click to view active borrowers & restock">
                <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600;">
                    ${getFastIconSvg('users', 12)} ${totalBorrowedUnits} unit${totalBorrowedUnits > 1 ? 's' : ''} on active loan
                </span>
                <span style="font-weight: 700; text-decoration: underline; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 3px;">
                    Inspect / Restock ${getFastIconSvg('arrow-right', 11)}
                </span>
            </div>
            `;
        }

        // Cart status for this item
        const inCart = typeof CartManager !== 'undefined' && CartManager.hasItem(item.id);
        const cartQty = typeof CartManager !== 'undefined' ? CartManager.getItemQty(item.id) : 0;
        const isOutOfStock = available <= 0;

        const cartBtnText = inCart ? `In Cart (${cartQty})` : (isOutOfStock ? 'Out of Stock' : '+ Add to Cart');
        const cartBtnIcon = inCart ? 'check' : 'shopping-bag';
        const cartBtnClass = inCart ? 'btn-card-add-cart in-cart' : 'btn-card-add-cart';

        card.innerHTML = `
            <div class="card-header">
                <span class="card-category-badge cat-${item.category}">${categoryLabel}</span>
                <div class="card-header-actions">
                    <span class="status-indicator ${statusClass}">
                        <span class="status-indicator-dot"></span>
                        ${statusText}
                    </span>
                </div>
            </div>
            <h3 class="card-title ${titleSizeClass}" title="${AdminManager.escapeHtml(itemName)}">${AdminManager.escapeHtml(itemName)}</h3>
            <p class="card-desc" title="${AdminManager.escapeHtml(item.specs)}">${AdminManager.escapeHtml(shortDesc)}</p>
            ${miniTagsHtml}
            ${loanBadgeHtml}
            <div class="card-footer">
                <div class="footer-info" title="${AdminManager.escapeHtml(item.location)}">
                    <span class="info-title">Location</span>
                    <span class="info-content">${getFastIconSvg('map-pin', 12)} ${AdminManager.escapeHtml(shortLocation)}</span>
                </div>
                <div class="footer-info" style="align-items: flex-end;">
                    <span class="info-title">Availability</span>
                    <span class="info-content"><strong class="stock-curr ${statusClass}">${available}</strong> <span class="stock-divider">/</span> ${totalQty}</span>
                    <div class="availability-bar-track">
                        <div class="availability-bar-fill fill-${statusClass}" style="width: ${fillPercent}%"></div>
                    </div>
                </div>
            </div>
            <div class="card-action-row">
                <button type="button" class="${cartBtnClass}" data-id="${item.id}" ${isOutOfStock ? 'disabled' : ''} title="${isOutOfStock ? 'Out of stock in vault' : 'Add to Hardware Request Cart'}">
                    ${getFastIconSvg(cartBtnIcon, 13)}
                    <span>${cartBtnText}</span>
                </button>
                ${deleteBtnHtml}
            </div>
        `;

        const addCartBtn = card.querySelector('.btn-card-add-cart') as HTMLButtonElement | null;
        if (addCartBtn) {
            addCartBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (typeof CartManager !== 'undefined') {
                    CartManager.addItem(item);
                }
            });
        }

        if (isAdmin) {
            const delBtn = card.querySelector('.btn-card-delete-item');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    AdminManager.promptDeleteItem(item.id, item.name);
                });
            }
        }

        if (myLoanTotal > 0) {
            const loanPill = card.querySelector('.card-loan-action-pill');
            if (loanPill) {
                loanPill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (myPendingReturn) {
                        ModalManager.openDetailModal(item);
                    } else {
                        const activeLoan = myLoans.find((r: any) => (r as any).status !== 'RETURN_REQUESTED') || myLoans[0];
                        if (activeLoan) {
                            ModalManager.openReturnModal(activeLoan, item, (item.borrowedBy || []).indexOf(activeLoan));
                        }
                    }
                });
            }
        } else if (isAdmin && totalBorrowedUnits > 0) {
            const adminPill = card.querySelector('.card-admin-loan-pill');
            if (adminPill) {
                adminPill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    ModalManager.openDetailModal(item);
                });
            }
        }

        const delBtn = card.querySelector<HTMLButtonElement>('.btn-card-delete-item');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                AdminManager.promptDeleteItem(item.id, itemName);
            });
        }

        card.addEventListener('click', () => {
            ModalManager.openDetailModal(item);
        });

        return card;
    }

    public static switchSection(targetId: string) {
        if (window.dashboard && (window.dashboard as any).switchSection) {
            (window.dashboard as any).switchSection(targetId);
        } else {
            const sideLink = document.querySelector(`.sidebar-nav-link[data-target="${targetId}"]`) as HTMLElement;
            if (sideLink) {
                sideLink.click();
            }
        }
    }
}

// ==========================================
// 4b. Hardware Request Cart Manager (Consolidated 1-Go Checkout)
// ==========================================
export interface CartItem {
    id: string;
    name: string;
    category: string;
    quantity: number;
    maxAvailable: number;
    location: string;
    specs: string;
    dueDate?: string;
}

class CartManager {
    private static items: CartItem[] = [];
    private static itemMap = new Map<string, number>();
    private static isInitialized = false;
    private static isCheckingOut = false;

    private static syncItemMap() {
        this.itemMap.clear();
        for (let i = 0; i < this.items.length; i++) {
            this.itemMap.set(this.items[i].id, this.items[i].quantity);
        }
    }

    public static init() {
        if (this.isInitialized) {
            this.updateCartBadges();
            return;
        }
        this.isInitialized = true;
        this.loadFromStorage();
        this.setupEventListeners();
        this.updateCartBadges();
    }

    private static loadFromStorage() {
        try {
            const raw = localStorage.getItem('cicr_cart_items');
            if (raw) {
                this.items = JSON.parse(raw);
            }
        } catch {
            this.items = [];
        }
        this.syncItemMap();
    }

    private static saveToStorage() {
        try {
            localStorage.setItem('cicr_cart_items', JSON.stringify(this.items));
        } catch {}
        this.syncItemMap();
        this.updateCartBadges();
    }

    public static getItems(): CartItem[] {
        return this.items;
    }

    public static getCount(): number {
        return this.items.length;
    }

    public static getTotalQuantity(): number {
        return this.items.reduce((sum, it) => sum + it.quantity, 0);
    }

    public static hasItem(itemId: string): boolean {
        return this.itemMap.has(itemId);
    }

    public static getItemQty(itemId: string): number {
        return this.itemMap.get(itemId) || 0;
    }

    public static addItem(item: InventoryItem, qty = 1) {
        const borrowedSum = (item.borrowedBy || [])
            .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            .reduce((sum, rec) => sum + rec.qty, 0);
        const totalQty = Number(item.quantity) || 0;
        const available = typeof item.availableQuantity === 'number'
            ? Math.min(totalQty, Math.max(0, item.availableQuantity))
            : Math.max(0, totalQty - borrowedSum);

        if (available <= 0) {
            ToastManager.show('Out of Stock', `"${item.name}" currently has 0 available units in the vault.`, 'warning');
            return;
        }

        const globalDueInput = document.getElementById('cart-due-date') as HTMLInputElement | null;
        const defaultDueDate = globalDueInput?.value || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const existing = this.items.find(it => it.id === item.id);
        if (existing) {
            if (existing.quantity >= available) {
                ToastManager.show('Stock Limit Reached', `Only ${available} unit(s) of "${item.name}" are available in the vault.`, 'info');
                return;
            }
            existing.quantity = Math.min(available, existing.quantity + qty);
            existing.maxAvailable = available;
            if (!existing.dueDate) existing.dueDate = defaultDueDate;
            ToastManager.show('Cart Updated', `Incremented "${item.name}" to ${existing.quantity} unit(s).`, 'success');
        } else {
            this.items.push({
                id: item.id,
                name: item.name,
                category: item.category,
                quantity: Math.min(available, Math.max(1, qty)),
                maxAvailable: available,
                location: item.location || 'Lab Shelf',
                specs: item.specs || '',
                dueDate: defaultDueDate
            });
            ToastManager.show('Added to Request Cart', `Added 1x "${item.name}" to your Hardware Request Cart.`, 'success');
        }

        this.saveToStorage();
        if (window.dashboard) {
            window.dashboard.renderInventory(true);
        }
        this.pulseFloatingCart();
    }

    public static removeItem(itemId: string) {
        const idx = this.items.findIndex(it => it.id === itemId);
        if (idx !== -1) {
            const removed = this.items.splice(idx, 1)[0];
            this.saveToStorage();
            ToastManager.show('Removed from Cart', `"${removed.name}" was removed from your cart.`, 'info');
            this.renderCartModal();
            if (window.dashboard) {
                window.dashboard.renderInventory(true);
            }
        }
    }

    public static updateQty(itemId: string, newQty: number) {
        const item = this.items.find(it => it.id === itemId);
        if (!item) return;

        if (newQty <= 0) {
            this.removeItem(itemId);
            return;
        }

        item.quantity = Math.min(item.maxAvailable, newQty);
        this.saveToStorage();
        this.renderCartModal();
        if (window.dashboard) {
            window.dashboard.renderInventory(true);
        }
    }

    public static clear() {
        this.items = [];
        this.saveToStorage();
        this.renderCartModal();
        if (window.dashboard) {
            window.dashboard.renderInventory(true);
        }
    }

    public static clearCart() {
        this.items = [];
        this.itemMap.clear();
        localStorage.removeItem('cicr_cart_items');
        this.updateCartBadges();
    }

    public static reloadFromStorage() {
        this.loadFromStorage();
        this.updateCartBadges();
    }

    public static updateCartBadges() {
        const count = this.getCount();

        // Top Navbar Small Cart Button
        const navbarBadge = document.getElementById('header-cart-badge');
        const navbarDot = document.getElementById('header-cart-dot');
        const navbarBtn = document.getElementById('btn-navbar-cart');
        if (navbarBadge) navbarBadge.innerText = String(count);
        if (navbarDot) navbarDot.style.display = count > 0 ? 'block' : 'none';
        if (navbarBtn) {
            if (count > 0) navbarBtn.classList.add('has-items');
            else navbarBtn.classList.remove('has-items');
        }

        // Vault Top Bar Cart Button
        const vaultBadge = document.getElementById('vault-cart-badge');
        const vaultDot = document.getElementById('vault-cart-dot');
        const vaultBtn = document.getElementById('btn-vault-cart-trigger');
        if (vaultBadge) vaultBadge.innerText = String(count);
        if (vaultDot) vaultDot.style.display = count > 0 ? 'block' : 'none';
        if (vaultBtn) {
            if (count > 0) vaultBtn.classList.add('has-items');
            else vaultBtn.classList.remove('has-items');
        }

        // Catalog Header Action Cart Badge
        const catalogBadge = document.getElementById('catalog-cart-badge');
        if (catalogBadge) catalogBadge.innerText = String(count);

        // Sidebar Cart Badge
        const sideNavBadge = document.getElementById('side-nav-cart-badge');
        if (sideNavBadge) {
            sideNavBadge.innerText = String(count);
            sideNavBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        // Dashboard Cart Card Text
        const dashCountText = document.getElementById('dash-cart-count-text');
        if (dashCountText) {
            dashCountText.innerText = count === 0 ? '0 items loaded' : `${count} component${count === 1 ? '' : 's'} staged`;
        }

        // Floating Action Button (FAB)
        const floatingFab = document.getElementById('floating-cart-fab');
        const floatingBadge = document.getElementById('floating-cart-badge');
        const floatingPing = document.getElementById('floating-cart-ping');
        if (floatingBadge) floatingBadge.innerText = String(count);
        if (floatingPing) floatingPing.style.display = count > 0 ? 'block' : 'none';
        if (floatingFab) {
            const isInventory = document.body.classList.contains('view-inventory-view') || (document.getElementById('inventory-view')?.style.display !== 'none');
            floatingFab.style.display = (isInventory || count > 0) ? 'block' : 'none';
        }

        // Capsule Nav Cart Badge (if on capsule view)
        const capsuleBadge = document.getElementById('nav-cart-badge');
        if (capsuleBadge) {
            capsuleBadge.innerText = String(count);
            capsuleBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        // Modal badge
        const modalBadge = document.getElementById('cart-manifest-badge');
        if (modalBadge) modalBadge.innerHTML = `<span class="cart-badge-dot"></span> ${count} item${count === 1 ? '' : 's'}`;
    }

    public static pulseFloatingCart() {
        const btns = [
            document.getElementById('btn-navbar-cart'),
            document.getElementById('btn-vault-cart-trigger'),
            document.getElementById('btn-floating-cart')
        ];
        btns.forEach(btn => {
            if (btn) {
                btn.classList.remove('pulse-anim');
                void btn.offsetWidth;
                btn.classList.add('pulse-anim');
            }
        });
    }

    public static openCart() {
        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        let userName = storedUser.name || storedUser.username || localStorage.getItem('cicr_auth') || 'Member';
        let userRoll = storedUser.roll_number || storedUser.roll || '';
        if (!userRoll && storedUser.email) {
            const m = String(storedUser.email).match(/^([0-9]{6,12})@/);
            if (m) userRoll = m[1];
        }

        const nameEl = document.getElementById('cart-borrower-name');
        const rollEl = document.getElementById('cart-borrower-roll');
        if (nameEl) nameEl.innerText = userName;
        if (rollEl) rollEl.innerText = userRoll || 'Student / Guest';

        const dueDateInput = document.getElementById('cart-due-date') as HTMLInputElement | null;
        if (dueDateInput && !dueDateInput.value) {
            const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            dueDateInput.min = new Date().toISOString().split('T')[0];
            dueDateInput.value = defaultDue;
        }

        this.renderCartModal();
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) {
            cartModal.classList.add('active');
            renderLucideIcons(cartModal);
        }
    }

    public static closeCart() {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) {
            cartModal.classList.remove('active');
        }
    }

    public static renderCartModal() {
        const listEl = document.getElementById('cart-items-list');
        const emptyState = document.getElementById('cart-empty-state');
        const checkoutPane = document.getElementById('cart-checkout-pane');
        const summaryCount = document.getElementById('cart-summary-count');
        const summaryTotalQty = document.getElementById('cart-summary-total-qty');
        const modalBadge = document.getElementById('cart-manifest-badge');

        const count = this.getCount();
        const totalQty = this.getTotalQuantity();

        if (summaryCount) {
            summaryCount.innerHTML = `<span class="hud-number">${count}</span> <span class="hud-suffix">component${count === 1 ? '' : 's'}</span>`;
        }
        if (summaryTotalQty) {
            summaryTotalQty.innerHTML = `<span class="hud-number text-cyan">${totalQty}</span> <span class="hud-suffix text-cyan-sub">unit${totalQty === 1 ? '' : 's'}</span>`;
        }
        if (modalBadge) modalBadge.innerHTML = `<span class="cart-badge-dot"></span> ${count} item${count === 1 ? '' : 's'}`;

        if (!listEl) return;
        listEl.innerHTML = '';

        if (count === 0) {
            if (emptyState) {
                emptyState.style.display = 'block';
                renderLucideIcons(emptyState);
            }
            if (checkoutPane) (checkoutPane as HTMLElement).style.opacity = '1';
            const submitBtn = document.getElementById('btn-submit-cart-checkout') as HTMLButtonElement | null;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.title = 'Add components from the catalog to submit request';
            }
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (checkoutPane) (checkoutPane as HTMLElement).style.opacity = '1';
        const submitBtn = document.getElementById('btn-submit-cart-checkout') as HTMLButtonElement | null;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.title = 'Checkout and submit hardware request';
        }

        const globalDueInput = document.getElementById('cart-due-date') as HTMLInputElement | null;
        const globalDueDate = globalDueInput?.value || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const minDate = new Date().toISOString().split('T')[0];

        this.items.forEach(it => {
            const itemDue = it.dueDate || globalDueDate;
            const row = document.createElement('div');
            row.className = 'cart-item-card';
            row.innerHTML = `
                <div class="cart-item-main-row">
                    <div class="cart-item-left">
                        <div class="cart-item-title-row">
                            <span class="cart-item-cat-chip">${AdminManager.escapeHtml(it.category || 'MCU')}</span>
                            <span class="cart-item-name" title="${AdminManager.escapeHtml(it.name)}">${AdminManager.escapeHtml(it.name)}</span>
                        </div>
                        <div class="cart-item-meta">
                            <span><i data-lucide="map-pin" style="width:11px;height:11px;vertical-align:middle;"></i> ${AdminManager.escapeHtml(it.location)}</span>
                            <span>&bull; Max Available: <strong class="cart-max-val">${it.maxAvailable}</strong></span>
                        </div>
                    </div>
                    <div class="cart-item-right">
                        <div class="cart-qty-ctrl">
                            <button type="button" class="cart-qty-btn btn-qty-minus" data-id="${it.id}" title="Decrease Quantity">
                                ${getFastIconSvg('minus', 11)}
                            </button>
                            <span class="cart-qty-val">${it.quantity}</span>
                            <button type="button" class="cart-qty-btn btn-qty-plus" data-id="${it.id}" title="Increase Quantity" ${it.quantity >= it.maxAvailable ? 'disabled' : ''}>
                                ${getFastIconSvg('plus', 11)}
                            </button>
                        </div>
                        <button type="button" class="btn-cart-remove" data-id="${it.id}" title="Remove Item">
                            ${getFastIconSvg('trash-2', 13)}
                        </button>
                    </div>
                </div>
                <div class="cart-item-date-bar">
                    <span class="item-date-label">
                        ${getFastIconSvg('calendar', 12)} Expected Return:
                    </span>
                    <div class="cart-item-date-right">
                        <input type="date" class="item-due-input" data-id="${it.id}" value="${itemDue}" min="${minDate}" title="Select custom return date for this component">
                        <button type="button" class="btn-item-date-sync" data-id="${it.id}" title="Sync with overall default return date">
                            ${getFastIconSvg('link', 11)} Same Date
                        </button>
                    </div>
                </div>
            `;

            row.querySelector('.btn-qty-minus')?.addEventListener('click', () => {
                this.updateQty(it.id, it.quantity - 1);
            });
            row.querySelector('.btn-qty-plus')?.addEventListener('click', () => {
                this.updateQty(it.id, it.quantity + 1);
            });
            row.querySelector('.btn-cart-remove')?.addEventListener('click', () => {
                this.removeItem(it.id);
            });

            // Per-item return date selection listener
            const itemDateInp = row.querySelector('.item-due-input') as HTMLInputElement | null;
            if (itemDateInp) {
                itemDateInp.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    it.dueDate = target.value;
                    this.saveToStorage();
                    ToastManager.show('Return Date Updated', `Return date for "${it.name}" set to ${it.dueDate}.`, 'info');
                });
            }

            // Sync with default date button
            const syncBtn = row.querySelector('.btn-item-date-sync') as HTMLButtonElement | null;
            if (syncBtn) {
                syncBtn.addEventListener('click', () => {
                    const curGlobal = (document.getElementById('cart-due-date') as HTMLInputElement)?.value || globalDueDate;
                    it.dueDate = curGlobal;
                    if (itemDateInp) itemDateInp.value = curGlobal;
                    this.saveToStorage();
                    ToastManager.show('Date Synced', `"${it.name}" return date synced to overall checkout date (${curGlobal}).`, 'success');
                });
            }

            listEl.appendChild(row);
        });

        renderLucideIcons(listEl);
    }

    public static async handleCheckout(e: Event) {
        e.preventDefault();
        if (this.isCheckingOut) return;

        const count = this.getCount();
        if (count === 0) {
            ToastManager.show('Cart Empty', 'Please add at least one component before checking out.', 'warning');
            return;
        }

        const purposeInput = document.getElementById('cart-purpose') as HTMLInputElement | null;
        const purpose = (purposeInput?.value || '').trim();
        if (!purpose) {
            ToastManager.show('Purpose Required', 'Please provide a project or purpose for this hardware issue.', 'warning');
            purposeInput?.focus();
            return;
        }

        const dueDateInput = document.getElementById('cart-due-date') as HTMLInputElement | null;
        const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dueDate = dueDateInput?.value || defaultDue;

        let durationDays = 7;
        if (dueDate) {
            const t0 = new Date();
            t0.setHours(0, 0, 0, 0);
            const t1 = new Date(dueDate);
            t1.setHours(0, 0, 0, 0);
            const diff = Math.round((t1.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > 0) durationDays = diff;
        }

        const token = localStorage.getItem('cicr_token');
        if (!token) {
            ToastManager.show('Authentication Required', 'Please log in to submit your hardware request.', 'error');
            return;
        }

        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        const borrowerName = storedUser.name || storedUser.username || localStorage.getItem('cicr_auth') || 'Member';
        let rollNum = storedUser.roll_number || storedUser.roll || '';
        if (!rollNum && storedUser.email) {
            const m = String(storedUser.email).match(/^([0-9]{6,12})@/);
            if (m) rollNum = m[1];
        }
        const userEmail = storedUser.email || (rollNum ? `${rollNum}@mail.jiit.ac.in` : (localStorage.getItem('cicr_auth')?.includes('@') ? localStorage.getItem('cicr_auth') : ''));

        const submitBtn = document.getElementById('btn-submit-cart-checkout') as HTMLButtonElement | null;
        this.isCheckingOut = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Processing Request Manifest...`;
            renderLucideIcons(submitBtn);
        }

        const date = new Date().toISOString().split('T')[0];
        const itemsToSubmit = [...this.items];

        const payload = {
            purpose,
            dueDate,
            due_date: dueDate,
            durationDays,
            duration_days: durationDays,
            borrowerName,
            borrower_name: borrowerName,
            borrowerEmail: userEmail,
            borrower_email: userEmail,
            rollNumber: rollNum,
            roll_number: rollNum,
            items: itemsToSubmit.map(it => {
                const itDueDate = it.dueDate || dueDate;
                let itDuration = durationDays;
                if (itDueDate) {
                    const t0 = new Date();
                    t0.setHours(0, 0, 0, 0);
                    const t1 = new Date(itDueDate);
                    t1.setHours(0, 0, 0, 0);
                    const diff = Math.round((t1.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));
                    if (diff > 0) itDuration = diff;
                }
                return {
                    itemId: it.id,
                    inventory_id: it.id,
                    itemName: it.name,
                    name: it.name,
                    quantity: it.quantity,
                    qty: it.quantity,
                    dueDate: itDueDate,
                    due_date: itDueDate,
                    durationDays: itDuration,
                    duration_days: itDuration
                };
            })
        };

        try {
            const res = await fetch(`${API_BASE}/borrow/bulk-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const resData = await res.json().catch(() => ({})) as any;

            itemsToSubmit.forEach((it, idx) => {
                const reqId = resData?.data?.[idx]?.id || `req-cart-${Date.now()}-${idx}`;
                const itDueDate = it.dueDate || dueDate;
                const newReq: RequestRecord = {
                    id: reqId,
                    itemId: it.id,
                    itemName: it.name,
                    name: borrowerName,
                    roll: rollNum,
                    qty: it.quantity,
                    purpose: purpose,
                    status: 'PENDING',
                    requestedAt: date,
                    dueDate: itDueDate
                };
                requests = requests.filter(r => r.id !== newReq.id && !(r.status === 'PENDING' && r.itemId === newReq.itemId && r.qty === newReq.qty && r.purpose === newReq.purpose));
                requests.unshift(newReq);
            });

            DatabaseManager.save();
            DatabaseManager.addLog('borrow', `<span>${borrowerName}</span> checked out request cart with ${itemsToSubmit.length} components for '${purpose}'.`);

            this.clear();
            this.closeCart();
            if (purposeInput) purposeInput.value = '';

            ToastManager.show(
                'Request Manifest Transmitted',
                `Successfully submitted ${itemsToSubmit.length} component(s) to the Admin Portal.`,
                'success'
            );

            AdminManager.loadHardwareRequests(true);
            DatabaseManager.updateNotificationBadges();
            await DatabaseManager.syncFromBackend();
        } catch (err: any) {
            console.error('Bulk checkout error, queuing locally:', err);
            itemsToSubmit.forEach((it, idx) => {
                const reqId = `req-cart-${Date.now()}-${idx}`;
                const itDueDate = it.dueDate || dueDate;
                const newReq: RequestRecord = {
                    id: reqId,
                    itemId: it.id,
                    itemName: it.name,
                    name: borrowerName,
                    roll: rollNum,
                    qty: it.quantity,
                    purpose: purpose,
                    status: 'PENDING',
                    requestedAt: date,
                    dueDate: itDueDate
                };
                requests = requests.filter(r => r.id !== newReq.id && !(r.status === 'PENDING' && r.itemId === newReq.itemId && r.qty === newReq.qty && r.purpose === newReq.purpose));
                requests.unshift(newReq);
            });

            DatabaseManager.save();
            DatabaseManager.addLog('borrow', `<span>${borrowerName}</span> queued request cart with ${itemsToSubmit.length} components for '${purpose}'.`);

            this.clear();
            this.closeCart();
            if (purposeInput) purposeInput.value = '';

            ToastManager.show(
                'Request Manifest Queued',
                `Hardware request for ${itemsToSubmit.length} components queued for Admin authorization.`,
                'success'
            );
            AdminManager.loadHardwareRequests(true);
        } finally {
            this.isCheckingOut = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="send"></i> Checkout & Submit Request`;
                renderLucideIcons(submitBtn);
            }
        }
    }

    private static setupEventListeners() {
        document.getElementById('btn-navbar-cart')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('nav-capsule-cart')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('btn-vault-cart-trigger')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('btn-catalog-cart-trigger')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('side-nav-cart')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('dash-card-cart')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('btn-floating-cart')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openCart();
        });

        document.getElementById('btn-close-cart-modal')?.addEventListener('click', () => {
            this.closeCart();
        });

        document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
            if (this.getCount() > 0) {
                this.clear();
            }
        });

        document.getElementById('btn-empty-cart-browse')?.addEventListener('click', () => {
            this.closeCart();
            if ((window as any).switchSection) {
                (window as any).switchSection('inventory-view');
            }
        });

        const form = document.getElementById('cart-checkout-form') as HTMLFormElement | null;
        if (form && !form.dataset.bound) {
            form.dataset.bound = 'true';
            form.addEventListener('submit', (e) => this.handleCheckout(e));
        }

        const cartPresets = document.querySelectorAll('.date-preset-pill.cart-preset');
        const dueDateInput = document.getElementById('cart-due-date') as HTMLInputElement | null;
        const durationBadge = document.getElementById('cart-duration-badge');

        const updateCartDurationBadge = (dateVal: string) => {
            if (!durationBadge || !dateVal) return;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(dateVal);
            target.setHours(0, 0, 0, 0);
            const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) {
                durationBadge.textContent = 'Due Today';
            } else if (diffDays === 1) {
                durationBadge.textContent = '1 Day Loan';
            } else {
                durationBadge.textContent = `${diffDays} Days Loan`;
            }
        };

        const syncAllItemsToGlobalDate = (newDate: string) => {
            this.items.forEach(it => {
                it.dueDate = newDate;
            });
            this.saveToStorage();
            document.querySelectorAll<HTMLInputElement>('.item-due-input').forEach(inp => {
                inp.value = newDate;
            });
        };

        dueDateInput?.addEventListener('input', () => {
            if (dueDateInput.value) {
                updateCartDurationBadge(dueDateInput.value);
                syncAllItemsToGlobalDate(dueDateInput.value);
            }
        });

        cartPresets.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                const days = Number((pill as HTMLElement).dataset.days) || 7;
                const newDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                if (dueDateInput) {
                    dueDateInput.value = newDate;
                    updateCartDurationBadge(newDate);
                    syncAllItemsToGlobalDate(newDate);
                }
                cartPresets.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });
        });
    }
}
(window as any).CartManager = CartManager;



// ==========================================
// 5. Modal & Form Controller Manager
// ==========================================
class ModalManager {
    static init() {
        document.querySelectorAll('.close-modal, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target === el || el.classList.contains('close-modal') || (e.target as HTMLElement)?.closest('.close-modal')) {
                    this.closeAll();
                }
            });
        });

        document.querySelectorAll('.modal-content').forEach(content => {
            content.addEventListener('click', (e) => e.stopPropagation());
        });

        const addForm = document.getElementById('add-item-form') as HTMLFormElement;
        if (addForm) {
            addForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAddItemSubmit();
            });
        }

        const btnInventoryAdd = document.getElementById('btn-inventory-add-item');
        if (btnInventoryAdd) {
            btnInventoryAdd.addEventListener('click', () => {
                if (this.getCurrentRole() !== 'ADMIN') {
                    ToastManager.show('Admin Access Required', 'Only administrators can register components into the vault.', 'warning');
                    return;
                }
                this.open('add-item-modal');
            });
        }

        const cancelAddBtn = document.getElementById('btn-add-cancel');
        if (cancelAddBtn) {
            cancelAddBtn.addEventListener('click', () => {
                this.close('add-item-modal');
            });
        }

        const borrowForm = document.getElementById('borrow-form') as HTMLFormElement;
        borrowForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBorrowSubmit();
        });

        document.querySelector('.btn-back-to-detail')?.addEventListener('click', () => {
            this.close('borrow-form-modal');
            this.open('detail-modal');
        });

        document.getElementById('btn-borrow')?.addEventListener('click', () => {
            this.openBorrowFormModal();
        });

        // Interactive Calendar Picker & Presets for Issue Return Date
        const dueDateInput = document.getElementById('borrow-due-date') as HTMLInputElement | null;
        const btnCalendar = document.getElementById('btn-calendar-picker');
        const calendarWrapper = document.getElementById('borrow-calendar-wrapper');
        const durationBadge = document.getElementById('borrow-duration-badge');
        const presetPills = document.querySelectorAll('#borrow-form-modal .date-preset-pill');

        const updateDurationBadge = (dateVal: string) => {
            if (!durationBadge || !dateVal) return;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(dateVal);
            target.setHours(0, 0, 0, 0);
            const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) {
                durationBadge.textContent = 'Due Today';
                durationBadge.className = 'form-label-badge badge-red';
            } else if (diffDays === 1) {
                durationBadge.textContent = '1 Day Loan';
                durationBadge.className = 'form-label-badge badge-blue';
            } else {
                durationBadge.textContent = `${diffDays} Days Loan`;
                durationBadge.className = 'form-label-badge badge-cyan';
            }
        };

        const openCalendar = (e?: Event) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (!dueDateInput) return;
            try {
                if (typeof (dueDateInput as any).showPicker === 'function') {
                    (dueDateInput as any).showPicker();
                } else {
                    dueDateInput.focus();
                }
            } catch (_) {
                dueDateInput.focus();
            }
        };

        btnCalendar?.addEventListener('click', openCalendar);
        calendarWrapper?.addEventListener('click', (e) => {
            if (e.target !== dueDateInput) {
                openCalendar(e);
            }
        });

        const handleDueDateChange = () => {
            if (dueDateInput?.value) {
                updateDurationBadge(dueDateInput.value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const target = new Date(dueDateInput.value);
                target.setHours(0, 0, 0, 0);
                const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                presetPills.forEach(pill => {
                    const pDays = Number((pill as HTMLElement).dataset.days);
                    pill.classList.toggle('active', pDays === diffDays);
                });
            }
        };

        dueDateInput?.addEventListener('input', handleDueDateChange);
        dueDateInput?.addEventListener('change', handleDueDateChange);

        presetPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                const days = Number((pill as HTMLElement).dataset.days) || 7;
                const newDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                if (dueDateInput) {
                    dueDateInput.value = newDate;
                    updateDurationBadge(newDate);
                }
                presetPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });
        });

        document.querySelector('.btn-close-about')!.addEventListener('click', () => {
            this.close('about-modal');
        });

        const returnQtyForm = document.getElementById('return-qty-form') as HTMLFormElement | null;
        if (returnQtyForm && !returnQtyForm.dataset.bound) {
            returnQtyForm.dataset.bound = 'true';
            returnQtyForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const borrowId = (document.getElementById('return-borrow-id') as HTMLInputElement)?.value;
                const idx = Number((document.getElementById('return-borrow-idx') as HTMLInputElement)?.value) || 0;
                const qtyVal = Number((document.getElementById('return-qty-input') as HTMLInputElement)?.value) || 1;
                await ModalManager.handleReturnSubmission(borrowId, qtyVal, idx);
            });

            const qtyInput = document.getElementById('return-qty-input') as HTMLInputElement | null;
            const btnMinus = document.getElementById('btn-return-qty-minus');
            const btnPlus = document.getElementById('btn-return-qty-plus');
            const btnAll = document.getElementById('btn-return-all-qty');

            btnMinus?.addEventListener('click', () => {
                if (qtyInput) {
                    const cur = parseInt(qtyInput.value, 10) || 1;
                    qtyInput.value = String(Math.max(1, cur - 1));
                    ModalManager.updateReturnQtyPreview();
                }
            });

            btnPlus?.addEventListener('click', () => {
                if (qtyInput) {
                    const max = parseInt(qtyInput.max, 10) || 1;
                    const cur = parseInt(qtyInput.value, 10) || 1;
                    qtyInput.value = String(Math.min(max, cur + 1));
                    ModalManager.updateReturnQtyPreview();
                }
            });

            btnAll?.addEventListener('click', () => {
                if (qtyInput) {
                    qtyInput.value = qtyInput.max || '1';
                    ModalManager.updateReturnQtyPreview();
                }
            });

            qtyInput?.addEventListener('input', () => {
                ModalManager.updateReturnQtyPreview();
            });
            qtyInput?.addEventListener('change', () => {
                ModalManager.updateReturnQtyPreview();
            });
        }
    }

    public static updateReturnQtyPreview() {
        const qtyInput = document.getElementById('return-qty-input') as HTMLInputElement | null;
        const previewEl = document.getElementById('return-qty-preview');
        if (!qtyInput) return;
        const maxVal = Math.max(1, parseInt(qtyInput.max, 10) || 1);
        let currentVal = parseInt(qtyInput.value, 10);
        if (isNaN(currentVal) || currentVal < 1) currentVal = 1;
        if (currentVal > maxVal) currentVal = maxVal;
        qtyInput.value = String(currentVal);

        if (previewEl) {
            if (currentVal >= maxVal) {
                previewEl.innerHTML = `<span style="color:var(--neon-cyan); font-weight:700;">Full Return (${maxVal} units)</span>`;
            } else {
                const remaining = maxVal - currentVal;
                previewEl.innerHTML = `<span style="color:#ffb703; font-weight:700;">Partial Return (${remaining} unit${remaining > 1 ? 's' : ''} stay issued)</span>`;
            }
        }
    }

    public static isUserLoanMatch(rec: BorrowRecord): boolean {
        if (!rec) return false;
        let storedUser: any = {};
        try { storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch {}
        const authName = (localStorage.getItem('cicr_auth') || '').toLowerCase().trim();
        const userName = (storedUser.name || storedUser.username || '').toLowerCase().trim();
        const userEmail = (storedUser.email || '').toLowerCase().trim();
        const userRoll = (storedUser.roll_number || storedUser.roll || '').toLowerCase().trim();
        const userId = storedUser.id || storedUser.userId || '';
        const recUserId = (rec as any).userId || (rec as any).user_id || '';

        const rRoll = ((rec as any).roll || (rec as any).rollNumber || (rec as any).roll_number || (rec as any).borrower_roll || (rec as any).userRoll || '').toLowerCase().trim();
        const rName = ((rec as any).userName || (rec as any).borrowerName || (rec as any).borrower_name || rec.name || '').toLowerCase().trim();
        const isGenericName = (n: string) => !n || ['member', 'student', 'user', 'admin', 'borrower', 'guest', 'student borrower'].includes(n) || n.length < 3;

        // 1. Direct User ID match (authoritative unless loan explicitly specifies another recipient)
        if (userId && recUserId && String(userId) === String(recUserId)) {
            if (rRoll && userRoll && rRoll !== userRoll) {
                // Different roll number -> Not this user
            } else if (!isGenericName(rName) && !isGenericName(userName) && rName !== userName && (!authName || rName !== authName)) {
                // Different borrower name -> Not this user
            } else {
                return true;
            }
        }

        // 2. Exact Roll Number match
        if (userRoll && rRoll && userRoll === rRoll) return true;
        if (userEmail && rRoll && (userEmail.startsWith(`${rRoll}@`) || userEmail === `${rRoll}@mail.jiit.ac.in`)) return true;

        // 3. Exact Email match
        const recEmail = ((rec as any).email || (rec as any).userEmail || (rec as any).borrowerEmail || (rec as any).borrower_email || '').toLowerCase().trim();
        if (userEmail && recEmail && userEmail === recEmail) return true;

        // 4. Exact Name match (guarding against generic placeholders like "member", "student", "user", "admin")
        if (!isGenericName(userName) && !isGenericName(rName) && userName === rName) return true;
        if (!isGenericName(authName) && !isGenericName(rName) && authName === rName) return true;

        return false;
    }

    public static isUserRequestMatch(req: any): boolean {
        if (!req) return false;
        let storedUser: any = {};
        try { storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch {}
        const authName = (localStorage.getItem('cicr_auth') || '').toLowerCase().trim();
        const userName = (storedUser.name || storedUser.username || '').toLowerCase().trim();
        const userEmail = (storedUser.email || '').toLowerCase().trim();
        const userRoll = (storedUser.roll_number || storedUser.roll || '').toLowerCase().trim();
        const userId = storedUser.id || storedUser.userId || '';
        const reqUserId = req.userId || req.user_id || '';

        const rRoll = (req.roll || req.rollNumber || req.roll_number || req.borrower_roll || req.userRoll || '').toLowerCase().trim();
        const rName = (req.name || req.borrowerName || req.borrower_name || req.userName || '').toLowerCase().trim();
        const isGenericName = (n: string) => !n || ['member', 'student', 'user', 'admin', 'borrower', 'guest', 'student borrower'].includes(n) || n.length < 3;

        // 1. Direct User ID match (authoritative unless explicitly another requester)
        if (userId && reqUserId && String(userId) === String(reqUserId)) {
            if (rRoll && userRoll && rRoll !== userRoll) {
                // Different roll number -> Not this user
            } else if (!isGenericName(rName) && !isGenericName(userName) && rName !== userName && (!authName || rName !== authName)) {
                // Different requester name -> Not this user
            } else {
                return true;
            }
        }

        // 2. Exact Roll Number match
        if (userRoll && rRoll && userRoll === rRoll) return true;
        if (userEmail && rRoll && (userEmail.startsWith(`${rRoll}@`) || userEmail === `${rRoll}@mail.jiit.ac.in`)) return true;

        // 3. Exact Email match
        const rEmail = (req.email || req.borrowerEmail || req.borrower_email || req.userEmail || '').toLowerCase().trim();
        if (userEmail && rEmail && userEmail === rEmail) return true;

        // 4. Exact Name match (guarding against generic placeholders like "member", "student", "user", "admin")
        if (!isGenericName(userName) && !isGenericName(rName) && userName === rName) return true;
        if (!isGenericName(authName) && !isGenericName(rName) && authName === rName) return true;

        return false;
    }

    static open(modalId: string) {
        document.getElementById(modalId)!.classList.add('active');
    }

    static close(modalId: string) {
        document.getElementById(modalId)!.classList.remove('active');
    }

    static closeAll() {
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.classList.remove('active');
        });
        selectedItem = null;
    }

    public static isDesignatedAdminUser(_email?: string | null, _name?: string | null, _username?: string | null): boolean {
        return this.getCurrentRole() === 'ADMIN';
    }

    public static getCurrentRole(): UserRole {
        const userStr = localStorage.getItem('cicr_user');
        if (!userStr) return 'MEMBER';
        try {
            const user = JSON.parse(userStr);
            return user && user.role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
        } catch {
            return 'MEMBER';
        }
    }

    private static isAdmin() {
        return this.getCurrentRole() === 'ADMIN';
    }

    private static setBorrowModalMode(mode: 'borrow' | 'request', componentName: string, available: number) {
        const modalTitle = document.getElementById('borrow-form-title');
        const subtitle = document.getElementById('borrow-form-subtitle');
        const submitBtn = document.getElementById('borrow-form-submit') as HTMLButtonElement | null;
        const qtyLimit = document.getElementById('borrow-qty-limit');

        if (mode === 'borrow') {
            if (modalTitle) modalTitle.innerText = '⚡ Direct Issue Component';
            if (subtitle) subtitle.innerText = `Issuing ${componentName} directly into student custody`;
            if (submitBtn) submitBtn.innerText = 'Confirm & Issue Hardware';
        } else {
            if (modalTitle) modalTitle.innerText = 'Request Component Issue';
            if (subtitle) subtitle.innerText = `Requesting ${componentName} - Requires Admin Authorization`;
            if (submitBtn) submitBtn.innerText = 'Submit Issue Request';
        }
        if (qtyLimit) {
            qtyLimit.innerText = `Max units available: ${available}`;
        }
    }

    private static renderRequests() {
        const requestInbox = document.getElementById('request-inbox') as HTMLElement | null;
        const requestList = document.getElementById('request-list');
        const requestCountBadge = document.getElementById('request-count-badge');

        if (!requestInbox || !requestList || !requestCountBadge) return;

        if (!this.isAdmin()) {
            requestInbox.style.display = 'none';
            requestCountBadge.innerText = '0';
            return;
        }

        requestInbox.style.display = 'flex';
        const pendingRequests = requests
            .filter((request) => request.status === 'PENDING')
            .sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
        requestCountBadge.innerText = String(pendingRequests.length);
        requestList.innerHTML = '';

        if (pendingRequests.length === 0) {
            requestList.innerHTML = '<div class="request-empty-state">No pending member requests right now.</div>';
            return;
        }

        pendingRequests.forEach((request) => {
            const requestEl = document.createElement('div');
            requestEl.className = 'request-item';
            requestEl.innerHTML = `
                <div class="request-item-header">
                    <div>
                        <h4 class="request-item-title">${escapeHtml(request.itemName)}</h4>
                        <div class="request-item-meta">
                            <span>${escapeHtml(request.name)}</span>
                            <span>${escapeHtml(request.roll)}</span>
                            <span>${Number(request.qty) || 1} units</span>
                        </div>
                    </div>
                    <span class="request-status-chip request-status-pending">${escapeHtml(request.status)}</span>
                </div>
                <div class="request-item-meta">
                    <span>Purpose: ${escapeHtml(request.purpose)}</span>
                    <span>Requested: ${escapeHtml(request.requestedAt)}</span>
                </div>
                <div class="request-item-actions">
                    <button class="btn btn-primary request-approve-btn" data-request-id="${escapeHtml(request.id)}">
                        <i data-lucide="check"></i> Approve
                    </button>
                    <button class="btn btn-secondary request-reject-btn" data-request-id="${escapeHtml(request.id)}">
                        <i data-lucide="x"></i> Reject
                    </button>
                </div>
            `;

            requestList.appendChild(requestEl);
        });

        requestList.querySelectorAll('.request-approve-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const requestId = (button as HTMLButtonElement).dataset.requestId;
                if (requestId) {
                    this.reviewRequest(requestId, 'APPROVED');
                }
            });
        });

        requestList.querySelectorAll('.request-reject-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const requestId = (button as HTMLButtonElement).dataset.requestId;
                if (requestId) {
                    this.reviewRequest(requestId, 'REJECTED');
                }
            });
        });
    }

    public static reviewRequest(requestId: string, nextStatus: 'APPROVED' | 'REJECTED') {
        if (!this.isAdmin()) return;

        const request = requests.find((entry) => entry.id === requestId);
        if (!request || request.status !== 'PENDING') return;

        if (nextStatus === 'APPROVED') {
            const item = inventory.find((entry) => entry.id === request.itemId);
            const borrowedSum = item
                ? (item.borrowedBy || [])
                    .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
                    .reduce((sum, rec) => sum + rec.qty, 0)
                : 0;
            const available = item ? item.quantity - borrowedSum : 0;

            if (!item || available < request.qty) {
                request.status = 'REJECTED';
                request.reviewedAt = new Date().toISOString();
                request.reviewedBy = localStorage.getItem('cicr_auth') || 'ADMIN';
                request.reviewNote = 'Auto-rejected because stock was no longer available.';
                DatabaseManager.addLog('reject', `<span>${request.name}</span>'s request for <span>${request.itemName}</span> was rejected because stock ran out.`);
                DatabaseManager.save();
                this.renderRequests();
                this.renderLogsDrawer();
                if (selectedItem && selectedItem.id === request.itemId) {
                    this.openDetailModal(selectedItem);
                }
                window.dashboard?.init();
                return;
            }

            const defaultDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            item.borrowedBy.push({
                name: request.name,
                roll: request.roll,
                qty: request.qty,
                purpose: request.purpose,
                date: new Date().toISOString().split('T')[0],
                dueDate: request.dueDate || defaultDueDate
            });

            DatabaseManager.addLog('approve', `<span>${request.name}</span>'s request for <span>${request.itemName}</span> was approved by admin.`);
            request.status = 'APPROVED';
        } else {
            DatabaseManager.addLog('reject', `<span>${request.name}</span>'s request for <span>${request.itemName}</span> was rejected by admin.`);
            request.status = 'REJECTED';
        }

        request.reviewedAt = new Date().toISOString();
        request.reviewedBy = localStorage.getItem('cicr_auth') || 'ADMIN';
        DatabaseManager.save();
        this.renderRequests();
        this.renderLogsDrawer();
        if (selectedItem && selectedItem.id === request.itemId) {
            this.openDetailModal(selectedItem);
        }
        window.dashboard?.init();
        lucide.createIcons();
    }

    static openAboutModal() {
        this.open('about-modal');
    }

    static openDetailModal(item: InventoryItem) {
        selectedItem = item;

        const borrowedSum = (item.borrowedBy || [])
            .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            .reduce((sum, rec) => sum + rec.qty, 0);
        const totalQty = Number(item.quantity) || 0;
        const available = typeof item.availableQuantity === 'number'
            ? Math.min(totalQty, Math.max(0, item.availableQuantity))
            : Math.max(0, totalQty - borrowedSum);

        document.getElementById('detail-name')!.innerText = item.name;
        document.getElementById('detail-location')!.innerText = item.location;
        document.getElementById('detail-specs')!.innerText = item.specs;
        const role = this.getCurrentRole();
        const detailQtyEl = document.getElementById('detail-quantity');
        if (detailQtyEl) {
            detailQtyEl.innerHTML = `<strong>${available}</strong> / ${totalQty} available`;
        }

        const catMap: Record<string, string> = {
            microcontrollers: "Microcontroller / Development Board",
            sensors: "Sensor & Module",
            actuators: "Actuator & Driver",
            power: "Power & Battery Storage",
            tools: "Lab Equipment / Tool"
        };
        document.getElementById('detail-category')!.innerText = catMap[item.category] || item.category;

        const badge = document.getElementById('detail-status')!;
        badge.className = 'modal-status-badge';

        const returnBtn = document.getElementById('btn-return') as HTMLButtonElement;

        const status = getItemStockStatus(totalQty, available);
        badge.innerText = status.text;
        badge.className = `modal-status-badge ${status.class}`;

        const totalBorrowedUnits = Math.max(0, totalQty - available);
        let cleanBorrowList = totalBorrowedUnits > 0
            ? (item.borrowedBy || []).filter(rec => !rec.returned && (rec as any).status !== 'RETURNED' && (rec as any).status !== 'REJECTED')
            : [];

        let myLoans = cleanBorrowList.filter(rec => (rec as any).status !== 'PENDING' && ModalManager.isUserLoanMatch(rec));
        
        // Fallback: If not found in item.borrowedBy, check ProfileViewManager.cachedHistory
        if (myLoans.length === 0 && totalBorrowedUnits > 0 && typeof ProfileViewManager !== 'undefined' && Array.isArray(ProfileViewManager.cachedHistory)) {
            const histMatches = ProfileViewManager.cachedHistory.filter((h: any) =>
                String(h.inventory_id || h.inventory?.id) === String(item.id) &&
                (h.status === 'BORROWED' || h.status === 'RETURN_REQUESTED')
            );
            if (histMatches.length > 0) {
                if (!item.borrowedBy) item.borrowedBy = [];
                for (const h of histMatches) {
                    if (!item.borrowedBy.some(b => b.id === h.id)) {
                        item.borrowedBy.push({
                            id: h.id,
                            name: h.borrower_name || h.users?.name || 'Member',
                            userName: h.borrower_name || h.users?.name || 'Member',
                            borrowerName: h.borrower_name || h.users?.name || 'Member',
                            roll: h.roll_number || h.users?.roll_number || '',
                            userRoll: h.roll_number || h.users?.roll_number || '',
                            email: h.borrower_email || h.users?.email || '',
                            userEmail: h.borrower_email || h.users?.email || '',
                            userId: h.user_id,
                            qty: Number(h.quantity) || 1,
                            purpose: h.purpose || 'Active Loan',
                            date: h.borrowed_at || new Date().toISOString(),
                            dueDate: h.due_date || null,
                            status: h.status,
                            returned: false
                        });
                    }
                }
                cleanBorrowList = totalBorrowedUnits > 0
                    ? (item.borrowedBy || []).filter(rec => !rec.returned && (rec as any).status !== 'RETURNED' && (rec as any).status !== 'REJECTED')
                    : [];
                myLoans = cleanBorrowList.filter(rec => (rec as any).status !== 'PENDING' && ModalManager.isUserLoanMatch(rec));
            }
        }

        const myActiveLoan = myLoans.find(r => (r as any).status !== 'RETURN_REQUESTED') || myLoans[0];
        const anyActiveLoan = cleanBorrowList.find(rec => (rec as any).status !== 'PENDING');
        const targetLoan = totalBorrowedUnits > 0 ? (myActiveLoan || (role === 'ADMIN' ? anyActiveLoan : null)) : null;

        // Display Return Issued Component button
        if (targetLoan) {
            const isPendingReturn = (targetLoan as any).status === 'RETURN_REQUESTED';
            returnBtn.style.display = 'inline-flex';
            if (isPendingReturn && role !== 'ADMIN') {
                returnBtn.disabled = true;
                returnBtn.style.opacity = '0.75';
                returnBtn.style.cursor = 'not-allowed';
                returnBtn.innerHTML = '<i data-lucide="clock"></i> Return Pending Admin Verification';
                returnBtn.onclick = null;
            } else {
                returnBtn.disabled = false;
                returnBtn.style.opacity = '1';
                returnBtn.style.cursor = 'pointer';
                returnBtn.innerHTML = role === 'ADMIN'
                    ? '<i data-lucide="corner-up-left"></i> Restock & Return'
                    : '<i data-lucide="corner-up-left"></i> Return Component';
                returnBtn.onclick = () => {
                    const loanIdx = item.borrowedBy ? item.borrowedBy.indexOf(targetLoan) : 0;
                    this.openReturnModal(targetLoan, item, loanIdx >= 0 ? loanIdx : 0);
                };
            }
        } else {
            returnBtn.style.display = 'none';
        }

        const directIssueBtn = document.getElementById('btn-modal-direct-issue') as HTMLButtonElement | null;
        if (directIssueBtn) {
            if (role === 'ADMIN' && available > 0) {
                directIssueBtn.style.display = 'inline-flex';
                renderLucideIcons(directIssueBtn);
                directIssueBtn.onclick = () => {
                    this.close('detail-modal');
                    this.openBorrowFormModal();
                };
            } else {
                directIssueBtn.style.display = 'none';
                directIssueBtn.onclick = null;
            }
        }

        const bulkReturnBtn = document.getElementById('btn-modal-bulk-return') as HTMLButtonElement | null;
        if (bulkReturnBtn) {
            let hasActiveLoans = false;
            for (const it of inventory) {
                if ((it.borrowedBy || []).some(r => !r.returned && (r as any).status !== 'RETURN_REQUESTED' && ModalManager.isUserLoanMatch(r))) {
                    hasActiveLoans = true;
                    break;
                }
            }
            if (hasActiveLoans) {
                bulkReturnBtn.style.display = 'inline-flex';
                bulkReturnBtn.onclick = () => {
                    this.closeAll();
                    this.openBulkReturnModal();
                };
            } else {
                bulkReturnBtn.style.display = 'none';
            }
        }

        const deleteItemBtn = document.getElementById('btn-modal-delete-item') as HTMLButtonElement;
        if (deleteItemBtn) {
            deleteItemBtn.style.display = role === 'ADMIN' ? 'inline-flex' : 'none';
            deleteItemBtn.onclick = () => {
                ModalManager.closeAll();
                AdminManager.promptDeleteItem(item.id, item.name);
            };
        }

        const modalCartBtn = document.getElementById('btn-modal-add-cart') as HTMLButtonElement | null;
        if (modalCartBtn) {
            if (available > 0) {
                modalCartBtn.disabled = false;
                modalCartBtn.style.opacity = '1';
                modalCartBtn.style.cursor = 'pointer';
                const inCart = typeof CartManager !== 'undefined' && CartManager.hasItem(item.id);
                const cartQty = typeof CartManager !== 'undefined' ? CartManager.getItemQty(item.id) : 0;
                if (inCart) {
                    modalCartBtn.classList.add('in-cart');
                    modalCartBtn.innerHTML = `<i data-lucide="check"></i> In Cart (${cartQty}) &bull; View Cart`;
                    modalCartBtn.onclick = () => {
                        this.closeAll();
                        if (typeof CartManager !== 'undefined') {
                            CartManager.openCart();
                        }
                    };
                } else {
                    modalCartBtn.classList.remove('in-cart');
                    modalCartBtn.innerHTML = `<i data-lucide="shopping-bag"></i> Add to Request Cart`;
                    modalCartBtn.onclick = () => {
                        if (typeof CartManager !== 'undefined') {
                            CartManager.addItem(item);
                            const updatedQty = CartManager.getItemQty(item.id);
                            modalCartBtn.classList.add('in-cart');
                            modalCartBtn.innerHTML = `<i data-lucide="check"></i> In Cart (${updatedQty}) &bull; View Cart`;
                            modalCartBtn.onclick = () => {
                                this.closeAll();
                                CartManager.openCart();
                            };
                            renderLucideIcons(modalCartBtn);
                        }
                    };
                }
            } else {
                modalCartBtn.disabled = true;
                modalCartBtn.style.opacity = '0.5';
                modalCartBtn.style.cursor = 'not-allowed';
                modalCartBtn.classList.remove('in-cart');
                modalCartBtn.innerHTML = `<i data-lucide="ban"></i> Out of Stock`;
                modalCartBtn.onclick = null;
            }
            renderLucideIcons(modalCartBtn);
        }

        const borrowersPanel = document.getElementById('borrowers-panel')!;
        const listContainer = document.getElementById('borrowers-list')!;
        listContainer.innerHTML = '';

        const isMember = role !== 'ADMIN';
        const visibleBorrowers = totalBorrowedUnits > 0
            ? (isMember ? cleanBorrowList.filter(rec => ModalManager.isUserLoanMatch(rec)) : cleanBorrowList)
            : [];

        if (visibleBorrowers.length > 0) {
            borrowersPanel.style.display = 'block';
            const todayStr = new Date().toISOString().split('T')[0];

            visibleBorrowers.forEach((rec) => {
                const origIdx = (item.borrowedBy || []).indexOf(rec);
                let due = rec.dueDate;
                if (!due && rec.date) {
                    const bTime = new Date(rec.date).getTime();
                    if (!isNaN(bTime)) {
                        due = new Date(bTime + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    }
                }
                const isOverdue = Boolean(due && due < todayStr);
                const dueBadge = due ? `<span class="borrower-due-badge ${isOverdue ? 'overdue' : ''}">${isOverdue ? 'OVERDUE: ' : 'Due: '}${due}</span>` : '';

                const isMyRecord = ModalManager.isUserLoanMatch(rec);
                const canReturn = isMyRecord || role === 'ADMIN';
                const isRecPendingReturn = (rec as any).status === 'RETURN_REQUESTED';
                const statusBadge = isRecPendingReturn
                    ? `<span class="borrower-due-badge" style="background:rgba(255,183,3,0.15);color:#ffb703;border:1px solid rgba(255,183,3,0.3);"><i data-lucide="clock" style="width:11px;height:11px;vertical-align:middle;"></i> Awaiting Verification</span>`
                    : dueBadge;
                const returnBtnText = role === 'ADMIN' ? 'Restock' : 'Return';

                const recEl = document.createElement('div');
                recEl.className = 'borrower-record';
                recEl.innerHTML = `
                    <div class="borrower-info-main">
                        <span class="borrower-name">${escapeHtml(rec.name)} ${isMyRecord ? '(Your Active Loan)' : ''}</span>
                        <span class="borrower-roll">${escapeHtml(rec.roll)} &bull; ${escapeHtml(rec.purpose)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${statusBadge}
                        <span class="borrower-qty-badge">${Number(rec.qty) || 1} units</span>
                        ${canReturn ? (
                        isRecPendingReturn && role !== 'ADMIN'
                            ? `<button class="btn btn-secondary" disabled style="padding: 6px 10px; font-size: 11px; opacity: 0.6; cursor: not-allowed;"><i data-lucide="clock" style="width:12px;height:12px;"></i> Verification Pending</button>`
                            : `<button class="btn btn-secondary btn-inline-return" style="padding: 6px 10px; font-size: 11px;"><i data-lucide="corner-up-left" style="width:12px;height:12px;"></i> ${returnBtnText}</button>`
                    ) : ''}
                    </div>
                `;

                if (canReturn && (!isRecPendingReturn || role === 'ADMIN')) {
                    recEl.querySelector('.btn-inline-return')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openReturnModal(rec, item, origIdx >= 0 ? origIdx : 0);
                    });
                }

                listContainer.appendChild(recEl);
            });
        } else {
            borrowersPanel.style.display = 'none';
        }

        this.open('detail-modal');
        lucide.createIcons();
    }

    static openBorrowFormModal() {
        if (!selectedItem) return;

        const role = this.getCurrentRole();
        const isAdmin = role === 'ADMIN';

        if (!isAdmin) {
            if (typeof CartManager !== 'undefined') {
                CartManager.addItem(selectedItem);
                this.closeAll();
                CartManager.openCart();
                return;
            }
        }

        const borrowedSum = (selectedItem.borrowedBy || [])
            .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            .reduce((sum, rec) => sum + rec.qty, 0);
        const available = typeof selectedItem.availableQuantity === 'number'
            ? selectedItem.availableQuantity
            : Math.max(0, selectedItem.quantity - borrowedSum);

        this.setBorrowModalMode(isAdmin ? 'borrow' : 'request', selectedItem.name, available);

        const nameInput = document.getElementById('borrow-name') as HTMLInputElement | null;
        const rollInput = document.getElementById('borrow-roll') as HTMLInputElement | null;

        if (isAdmin) {
            if (nameInput) {
                nameInput.value = '';
                nameInput.defaultValue = '';
                nameInput.readOnly = false;
                nameInput.removeAttribute('tabindex');
                nameInput.placeholder = 'Student / Borrower full name';
                nameInput.title = 'Enter the recipient student or borrower name';
            }
            if (rollInput) {
                rollInput.value = '';
                rollInput.defaultValue = '';
                rollInput.readOnly = false;
                rollInput.removeAttribute('tabindex');
                rollInput.placeholder = 'Student Enrollment / Roll No.';
                rollInput.title = 'Enter the student enrollment ID';
            }
            const purposeInput = document.getElementById('borrow-purpose') as HTMLInputElement | null;
            if (purposeInput) {
                purposeInput.value = '';
            }
        } else {
            // Auto-fill logged-in borrower details
            let currentUserName = '';
            let currentUserRoll = '';
            try {
                const userStr = localStorage.getItem('cicr_user');
                if (userStr) {
                    const parsed = JSON.parse(userStr);
                    currentUserName = parsed.name || parsed.username || '';
                    currentUserRoll = parsed.roll_number || parsed.roll || '';
                    if (!currentUserRoll && parsed.email) {
                        const match = String(parsed.email).match(/^([0-9]{6,12})@/);
                        if (match) currentUserRoll = match[1];
                    }
                }
            } catch { }

            if (!currentUserName) {
                currentUserName = localStorage.getItem('cicr_auth') || '';
            }

            if (!currentUserName) {
                const profileDisplay = document.getElementById('profile-username-display');
                if (profileDisplay && profileDisplay.innerText.trim()) {
                    currentUserName = profileDisplay.innerText.trim();
                }
            }

            if (!currentUserRoll && currentUserName) {
                const match = currentUserName.match(/^([0-9]{6,12})$/);
                if (match) currentUserRoll = match[1];
            }

            if (nameInput) {
                nameInput.value = currentUserName || '';
                nameInput.defaultValue = currentUserName || '';
                nameInput.readOnly = true;
                nameInput.setAttribute('tabindex', '-1');
                nameInput.title = 'Verified account identity (locked)';
            }

            if (rollInput) {
                rollInput.value = currentUserRoll || '';
                rollInput.defaultValue = currentUserRoll || '';
                if (currentUserRoll) {
                    rollInput.readOnly = true;
                    rollInput.setAttribute('tabindex', '-1');
                    rollInput.title = 'Verified student enrollment ID (locked)';
                } else {
                    rollInput.readOnly = false;
                    rollInput.removeAttribute('tabindex');
                    rollInput.title = 'Enter your enrollment ID';
                }
            }
        }

        const qtyInput = document.getElementById('borrow-qty') as HTMLInputElement;
        qtyInput.max = String(available);
        qtyInput.value = '1';

        const dueDateInput = document.getElementById('borrow-due-date') as HTMLInputElement | null;
        if (dueDateInput) {
            const today = new Date().toISOString().split('T')[0];
            const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            dueDateInput.min = today;
            dueDateInput.value = defaultDue;
            const durationBadge = document.getElementById('borrow-duration-badge');
            if (durationBadge) {
                durationBadge.textContent = '7 Days Loan';
                durationBadge.className = 'form-label-badge badge-cyan';
            }
            document.querySelectorAll('.date-preset-pill').forEach(pill => {
                pill.classList.toggle('active', (pill as HTMLElement).dataset.days === '7');
            });
        }

        this.close('detail-modal');
        this.open('borrow-form-modal');
        lucide.createIcons();
    }

    static activeNotifTab: string = 'issues';

    static openLogsDrawer() {
        if (typeof HardwareLedgerManager !== 'undefined' && typeof HardwareLedgerManager.fetchLedger === 'function') {
            HardwareLedgerManager.fetchLedger(true).then(() => {
                ModalManager.renderLogsDrawer();
            }).catch(() => {});
        }
        if (typeof AdminManager !== 'undefined' && typeof AdminManager.loadHardwareRequests === 'function') {
            AdminManager.loadHardwareRequests(true).then(() => {
                ModalManager.renderLogsDrawer();
            }).catch(() => {});
        }
        this.renderLogsDrawer();
        this.open('logs-drawer');
        lucide.createIcons();
    }

    static renderLogsDrawer() {
        const logsList = document.getElementById('logs-list');
        if (!logsList) return;

        const role = this.getCurrentRole();
        const isAdmin = role === 'ADMIN';

        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        const isUserRequest = (req: any): boolean => ModalManager.isUserRequestMatch(req);

        // Update Header Badge, Title, and Subtitle
        const roleBadgeEl = document.getElementById('notif-drawer-role-badge');
        const roleDotEl = document.getElementById('notif-role-dot');
        const roleTextEl = document.getElementById('notif-role-text');
        const subtitleEl = document.getElementById('notif-drawer-subtitle');
        const titleEl = document.getElementById('notif-drawer-title');

        if (isAdmin) {
            if (titleEl) titleEl.innerText = 'User Component Requests';
            if (roleBadgeEl) {
                roleBadgeEl.classList.remove('role-badge-member');
                roleBadgeEl.classList.add('role-badge-admin');
            }
            if (roleDotEl) {
                roleDotEl.classList.remove('dot-member');
                roleDotEl.classList.add('dot-admin');
            }
            if (roleTextEl) roleTextEl.innerText = 'ADMIN AUDIT';
            if (subtitleEl) subtitleEl.innerText = 'Track pending, accepted & rejected component requests';
        } else {
            const memberName = storedUser.name ? storedUser.name.split(' ')[0] + "'s" : 'My';
            if (titleEl) titleEl.innerText = `${memberName} Requests & Status`;
            if (roleBadgeEl) {
                roleBadgeEl.classList.remove('role-badge-admin');
                roleBadgeEl.classList.add('role-badge-member');
            }
            if (roleDotEl) {
                roleDotEl.classList.remove('dot-admin');
                roleDotEl.classList.add('dot-member');
            }
            if (roleTextEl) roleTextEl.innerText = 'MEMBER ACCESS';
            if (subtitleEl) subtitleEl.innerText = 'Track pending, accepted & rejected component requests';
        }

        // Segmented Category Tabs: Exclusively Pending, Accepted, and Rejected
        const tabPending = document.getElementById('notif-tab-pending');
        const tabApproved = document.getElementById('notif-tab-approved');
        const tabRejected = document.getElementById('notif-tab-rejected');

        if (tabPending) tabPending.style.display = 'inline-flex';
        if (tabApproved) tabApproved.style.display = 'inline-flex';
        if (tabRejected) tabRejected.style.display = 'inline-flex';

        // Hide obsolete tabs
        ['notif-tab-issues', 'notif-tab-requests', 'notif-tab-returns', 'notif-tab-stock', 'notif-tab-system'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Setup tab click listeners once
        const tabsBar = document.getElementById('notif-tabs-bar');
        if (tabsBar && !tabsBar.dataset.bound) {
            tabsBar.dataset.bound = 'true';
            tabsBar.querySelectorAll<HTMLButtonElement>('.notif-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const cat = btn.getAttribute('data-category') || 'pending';
                    ModalManager.activeNotifTab = cat;
                    ModalManager.renderLogsDrawer();
                    lucide.createIcons();
                });
            });
        }

        // --- GATHER REQUESTS DATA ---
        const requestMap = new Map<string, any>();
        const idToKeyMap = new Map<string, string>();

        const getDrawerKey = (r: any): string => {
            if (typeof AdminManager !== 'undefined' && typeof AdminManager.getRequestCanonicalKey === 'function') {
                return AdminManager.getRequestCanonicalKey(r);
            }
            const isReturn = r.type === 'RETURN' || Boolean(r.borrowId);
            if (isReturn) return `ret__${(r.borrowId || r.id || '').trim().toLowerCase()}`;
            const email = (r.borrowerEmail || r.email || '').toLowerCase().trim();
            const name = (r.borrowerName || r.name || '').toLowerCase().trim();
            const roll = (r.rollNumber || r.roll || '').toLowerCase().trim();
            const itemId = (r.itemId || r.itemName || '').toLowerCase().trim();
            const qty = Number(r.quantity || r.qty) || 1;
            const purp = (r.purpose || '').toLowerCase().trim();
            const borrower = roll || email || name;
            return `iss__${borrower}__${itemId}__${qty}__${purp}`;
        };

        const handledIds = typeof AdminManager !== 'undefined' ? AdminManager.getHandledRequestIds() : new Set<string>();

        const isDrawerItemDismissed = (r: any): boolean => {
            if (!r) return true;
            if (r.status !== 'PENDING') return false;
            if (handledIds.has(r.id)) return true;
            if (r.borrowId && handledIds.has(r.borrowId)) return true;
            const key = getDrawerKey(r);
            if (key && handledIds.has(key)) return true;
            return false;
        };

        const addOrMergeDrawerRequest = (r: any) => {
            if (!r) return;
            const status = (r.status || 'PENDING').toUpperCase();
            if (status === 'PENDING' && isDrawerItemDismissed(r)) {
                return;
            }

            const key = getDrawerKey(r) || String(r.id || Math.random());
            const reqId = r.id ? String(r.id) : '';
            const borrowId = r.borrowId ? String(r.borrowId) : '';

            // Find existing request entry if any
            let existingKey: string | null = null;
            if (requestMap.has(key)) {
                existingKey = key;
            } else if (reqId && idToKeyMap.has(reqId)) {
                existingKey = idToKeyMap.get(reqId)!;
            } else if (borrowId && idToKeyMap.has(borrowId)) {
                existingKey = idToKeyMap.get(borrowId)!;
            }

            if (existingKey && requestMap.has(existingKey)) {
                const existing = requestMap.get(existingKey);
                const existingStatus = (existing.status || 'PENDING').toUpperCase();

                // If existing is PENDING and incoming is APPROVED or REJECTED:
                // Incoming replaces existing completely! (Pending is removed!)
                if (existingStatus === 'PENDING' && (status === 'APPROVED' || status === 'REJECTED')) {
                    requestMap.set(existingKey, r);
                    if (reqId) idToKeyMap.set(reqId, existingKey);
                    if (borrowId) idToKeyMap.set(borrowId, existingKey);
                    return;
                }

                // If existing is APPROVED or REJECTED, incoming PENDING is discarded!
                if ((existingStatus === 'APPROVED' || existingStatus === 'REJECTED') && status === 'PENDING') {
                    return;
                }

                // If same status, keep the richer record
                if (status === existingStatus) {
                    if (!existing.reviewedBy && r.reviewedBy) {
                        requestMap.set(existingKey, { ...existing, ...r });
                    }
                    return;
                }
            }

            requestMap.set(key, r);
            if (reqId) idToKeyMap.set(reqId, key);
            if (borrowId) idToKeyMap.set(borrowId, key);
        };

        // 1. For non-admin, ONLY process their own requests from userHardwareRequests
        if (!isAdmin && typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.userHardwareRequests)) {
            AdminManager.userHardwareRequests.forEach(r => {
                if (isUserRequest(r)) addOrMergeDrawerRequest(r);
            });
        }

        // 2. For admin, process full hardware queue across all members
        if (isAdmin && typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.hardwareRequests)) {
            AdminManager.hardwareRequests.forEach(addOrMergeDrawerRequest);
        }

        // 3. Process requests state
        (requests || []).forEach(r => {
            if (isAdmin || isUserRequest(r)) addOrMergeDrawerRequest(r);
        });

        // 4. Connect historical & active checkout requests from backend Hardware Ledger
        if (typeof HardwareLedgerManager !== 'undefined' && typeof HardwareLedgerManager.getRecords === 'function') {
            const ledgerRecords = HardwareLedgerManager.getRecords();
            if (Array.isArray(ledgerRecords)) {
                ledgerRecords.forEach((rec: any) => {
                    if (!rec) return;
                    if (!isAdmin && !isUserRequest(rec)) return; // Strictly ignore other members' ledger entries!

                    const isRet = rec.action_type === 'RETURNED' || Boolean(rec.return_date) || rec.status === 'RETURNED';
                    const isPend = rec.action_type === 'PENDING_APPROVAL' || rec.status === 'PENDING';
                    const statusVal: 'PENDING' | 'APPROVED' | 'REJECTED' = isPend ? 'PENDING' : (rec.status === 'REJECTED' ? 'REJECTED' : 'APPROVED');

                    const mappedReq: any = {
                        id: rec.id,
                        type: isRet ? 'RETURN' : 'ISSUE',
                        borrowId: isRet ? rec.id : undefined,
                        returnQuantity: isRet ? rec.quantity : undefined,
                        itemId: rec.component_id,
                        itemName: rec.component_name,
                        category: rec.category,
                        borrowerName: rec.borrower_name,
                        borrowerEmail: rec.borrower_email,
                        rollNumber: rec.borrower_roll,
                        quantity: rec.quantity,
                        purpose: rec.purpose || (isRet ? 'Return of hardware' : 'Hardware Issue'),
                        dueDate: rec.due_date,
                        status: statusVal,
                        requestedAt: rec.date || new Date().toISOString(),
                        reviewedAt: rec.return_date || rec.date,
                        reviewedBy: rec.admin_approved_by || rec.reviewed_by || 'Lab Administrator'
                    };

                    addOrMergeDrawerRequest(mappedReq);
                });
            }
        }

        const combinedRequests: (RequestRecord | AdminHardwareRequest)[] = Array.from(requestMap.values());

        const isReturnReqRecord = (r: any): boolean => {
            if (r.type === 'RETURN') return true;
            if (Boolean(r.borrowId)) return true;
            const p = (r.purpose || '').toLowerCase();
            return p.startsWith('return ') || p.includes('return of');
        };

        const visibleRequests: any[] = isAdmin
            ? combinedRequests
            : combinedRequests.filter(r => isUserRequest(r));
        visibleRequests.sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());

        const pendingRequests = visibleRequests.filter(r => r.status === 'PENDING');
        const approvedRequests = visibleRequests.filter(r => r.status === 'APPROVED');
        const rejectedRequests = visibleRequests.filter(r => r.status === 'REJECTED');

        if (!['pending', 'approved', 'rejected'].includes(this.activeNotifTab)) {
            if (pendingRequests.length > 0) {
                this.activeNotifTab = 'pending';
            } else if (approvedRequests.length > 0) {
                this.activeNotifTab = 'approved';
            } else {
                this.activeNotifTab = 'pending';
            }
        }

        // --- UPDATE BADGE COUNTS ON TABS ---
        const countPending = document.getElementById('notif-count-pending');
        const countApproved = document.getElementById('notif-count-approved');
        const countRejected = document.getElementById('notif-count-rejected');

        if (countPending) countPending.innerText = String(pendingRequests.length);
        if (countApproved) countApproved.innerText = String(approvedRequests.length);
        if (countRejected) countRejected.innerText = String(rejectedRequests.length);

        // Highlight active tab button
        if (tabsBar) {
            tabsBar.querySelectorAll('.notif-tab-btn').forEach(btn => {
                const cat = btn.getAttribute('data-category');
                btn.classList.toggle('active', cat === this.activeNotifTab);
            });
        }

        // Synchronize sidebar and topbar badges as well
        DatabaseManager.updateNotificationBadges();

        // Card rendering helper
        const createRequestCard = (req: any, isReturnCard: boolean = false): HTMLElement => {
            const el = document.createElement('div');
            const status = (req.status || 'PENDING').toUpperCase();
            el.className = `notif-card card-request card-request-${status.toLowerCase()}`;

            let statusBadge = '';
            if (status === 'APPROVED') {
                statusBadge = isReturnCard
                    ? `<span class="notif-status-badge badge-cyan"><i data-lucide="shield-check"></i> RETURN ACCEPTED</span>`
                    : `<span class="notif-status-badge badge-green"><i data-lucide="check-circle-2"></i> ACCEPTED & ISSUED</span>`;
            } else if (status === 'REJECTED') {
                statusBadge = `<span class="notif-status-badge badge-red"><i data-lucide="x-circle"></i> DECLINED</span>`;
            } else {
                statusBadge = `<span class="notif-status-badge badge-yellow"><i data-lucide="clock"></i> PENDING APPROVAL</span>`;
            }

            const actionsHtml = (isAdmin && status === 'PENDING') ? `
                <div class="notif-card-actions">
                    <button class="notif-action-btn notif-btn-approve" data-req-id="${req.id}" data-is-return="${isReturnCard ? 'true' : 'false'}">
                        <i data-lucide="check"></i> Approve
                    </button>
                    <button class="notif-action-btn notif-btn-reject" data-req-id="${req.id}">
                        <i data-lucide="x"></i> Reject
                    </button>
                </div>
            ` : '';

            const bName = req.borrowerName || req.name || 'Member';
            const bRoll = req.rollNumber || req.roll || 'Student';
            const bQty = Number(req.quantity || req.qty || req.returnQuantity) || 1;
            const tagIcon = isReturnCard ? 'rotate-ccw' : (status === 'APPROVED' ? 'check-circle' : (status === 'REJECTED' ? 'x-circle' : 'send'));
            const tagColor = isReturnCard ? 'tag-cyan' : (status === 'APPROVED' ? 'tag-green' : (status === 'REJECTED' ? 'tag-red' : 'tag-purple'));
            const tagTitle = isReturnCard ? 'RETURN REQUEST' : (status === 'APPROVED' ? 'HARDWARE ISSUED' : (status === 'REJECTED' ? 'REQUEST DECLINED' : 'ISSUE REQUEST'));

            const reviewer = req.reviewedBy || req.admin_approved_by || req.reviewer || 'Administrator';
            const reviewNote = req.reviewNote || req.reason || '';

            const origQty = Number(req.originalQuantity) || 0;
            const isQueueAdjusted = origQty > 0 && origQty > bQty;
            const queueBadge = isQueueAdjusted
                ? `<span class="notif-status-badge badge-yellow" style="font-size:10px; margin-left:6px;" title="Requested: ${origQty}x | Queue Allocated: ${bQty}x"><i data-lucide="info"></i> Queue: ${bQty}/${origQty} Allocated</span>`
                : '';

            const canReturnIssued = !isReturnCard && status === 'APPROVED' && (isAdmin || isUserRequest(req));
            const returnIssuedActionHtml = canReturnIssued ? `
                <div class="notif-card-actions" style="margin-top:8px;">
                    <button type="button" class="notif-action-btn notif-btn-return-issued" data-item-id="${req.itemId}" data-borrow-id="${req.borrowId || req.id}" data-qty="${bQty}" data-req-id="${req.id}" style="background:rgba(99, 102, 241, 0.15); border:1px solid rgba(99, 102, 241, 0.35); color:#a5b4fc; font-weight:600; cursor:pointer;">
                        <i data-lucide="corner-up-left"></i> Return Hardware
                    </button>
                </div>
            ` : '';

            el.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-card-tag ${tagColor}">
                        <i data-lucide="${tagIcon}"></i>
                        <span>${tagTitle}</span>
                    </div>
                    ${statusBadge}
                    ${queueBadge}
                </div>
                <div class="notif-card-body">
                    <p class="notif-card-main-text">
                        <strong>${bQty}x ${escapeHtml(req.itemName)}</strong> ${isReturnCard ? 'return requested by' : (status === 'APPROVED' ? 'approved & issued to' : (status === 'REJECTED' ? 'request from' : 'requested by'))} <span class="notif-user-pill">${escapeHtml(bName)}</span> (${escapeHtml(bRoll)})
                    </p>
                    <p class="notif-card-sub-text">
                        Purpose: ${escapeHtml(req.purpose || (isReturnCard ? 'Return of hardware' : 'Lab Project'))} &bull; Requested: ${req.requestedAt ? new Date(req.requestedAt).toLocaleDateString() : 'Recent'}
                        ${req.dueDate ? ` &bull; Due Date: <strong>${escapeHtml(req.dueDate)}</strong>` : ''}
                    </p>
                    ${status === 'APPROVED' ? `
                        <div class="card-request-admin-note note-approved">
                            <i data-lucide="shield-check" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                            Approved by: <strong>${escapeHtml(reviewer)}</strong>${req.reviewedAt ? ` &bull; on ${new Date(req.reviewedAt).toLocaleDateString()}` : ''}
                        </div>
                    ` : ''}
                    ${status === 'REJECTED' ? `
                        <div class="card-request-admin-note">
                            <i data-lucide="alert-circle" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                            Declined by: <strong>${escapeHtml(reviewer)}</strong>${req.reviewedAt ? ` &bull; on ${new Date(req.reviewedAt).toLocaleDateString()}` : ''}
                            ${reviewNote ? `<br>Reason: "${escapeHtml(reviewNote)}"` : ''}
                        </div>
                    ` : ''}
                    ${status === 'PENDING' ? `
                        <div class="card-request-admin-note" style="background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.25); color:#fcd34d;">
                            <i data-lucide="clock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                            Awaiting Admin Approval. You will be notified via email when reviewed.
                        </div>
                    ` : ''}
                </div>
                ${actionsHtml}
                ${returnIssuedActionHtml}
            `;

            return el;
        };

        const bindAdminCardActions = (container: HTMLElement) => {
            if (!isAdmin) return;
            container.querySelectorAll<HTMLButtonElement>('.notif-btn-approve').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reqId = btn.getAttribute('data-req-id');
                    if (reqId) {
                        btn.disabled = true;
                        if (typeof AdminManager !== 'undefined' && typeof AdminManager.approveHardware === 'function') {
                            await AdminManager.approveHardware(reqId);
                        } else {
                            ModalManager.reviewRequest(reqId, 'APPROVED');
                        }
                        DatabaseManager.isNotificationsCleared = false;
                        DatabaseManager.updateNotificationBadges();
                        ModalManager.renderLogsDrawer();
                    }
                });
            });
            container.querySelectorAll<HTMLButtonElement>('.notif-btn-reject').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reqId = btn.getAttribute('data-req-id');
                    if (reqId) {
                        btn.disabled = true;
                        if (typeof AdminManager !== 'undefined' && typeof AdminManager.rejectHardware === 'function') {
                            await AdminManager.rejectHardware(reqId);
                        } else {
                            ModalManager.reviewRequest(reqId, 'REJECTED');
                        }
                        DatabaseManager.isNotificationsCleared = false;
                        DatabaseManager.updateNotificationBadges();
                        ModalManager.renderLogsDrawer();
                    }
                });
            });
        };

        // --- RENDER CONTENT BASED ON ACTIVE TAB ---
        logsList.innerHTML = '';
        const currentCategory = this.activeNotifTab;

        if (currentCategory === 'approved') {
            if (approvedRequests.length === 0) {
                logsList.appendChild(ModalManager.createEmptyNotifCard('check-circle-2', 'No Accepted Requests', 'No component requests have been accepted yet.'));
            } else {
                approvedRequests.forEach(req => logsList.appendChild(createRequestCard(req, isReturnReqRecord(req))));
            }
        } else if (currentCategory === 'rejected') {
            if (rejectedRequests.length === 0) {
                logsList.appendChild(ModalManager.createEmptyNotifCard('shield-alert', 'No Declined Requests', 'No component requests have been declined.'));
            } else {
                rejectedRequests.forEach(req => logsList.appendChild(createRequestCard(req, isReturnReqRecord(req))));
            }
        } else {
            // Default to pending
            if (pendingRequests.length === 0) {
                logsList.appendChild(ModalManager.createEmptyNotifCard('clock', 'No Pending Requests', 'No component requests currently awaiting admin review.'));
            } else {
                pendingRequests.forEach(req => logsList.appendChild(createRequestCard(req, isReturnReqRecord(req))));
                bindAdminCardActions(logsList);
            }
        }

        // Attach Return Hardware button listeners for any approved cards
        logsList.querySelectorAll<HTMLButtonElement>('.notif-btn-return-issued').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = btn.dataset.itemId;
                const borrowId = btn.dataset.borrowId;
                const qty = parseInt(btn.dataset.qty || '1', 10);
                const reqId = btn.dataset.reqId;

                const targetItem = inventory.find(i => String(i.id) === String(itemId)) || {
                    id: itemId || '',
                    name: 'Hardware Component',
                    category: 'tools',
                    quantity: 1,
                    availableQuantity: 0,
                    location: 'Lab',
                    specs: '',
                    image: '',
                    tags: [],
                    borrowedBy: []
                };

                const matchingLoan: BorrowRecord = (targetItem.borrowedBy || []).find((b: any) =>
                    (borrowId && (b.id === borrowId || b._id === borrowId)) ||
                    ModalManager.isUserLoanMatch(b)
                ) || {
                    id: borrowId || reqId || `loan-${Date.now()}`,
                    name: localStorage.getItem('cicr_auth') || 'Member',
                    roll: '',
                    qty: qty,
                    purpose: 'Active Loan',
                    date: new Date().toISOString()
                };

                ModalManager.openReturnModal(matchingLoan, targetItem as any, 0);
            });
        });
    }

    private static createEmptyNotifCard(icon: string, title: string, desc: string): HTMLElement {
        const div = document.createElement('div');
        div.className = 'notif-empty-state';
        div.innerHTML = `
            <div class="notif-empty-icon-box">
                <i data-lucide="${icon}"></i>
            </div>
            <h4>${title}</h4>
            <p>${desc}</p>
        `;
        return div;
    }

    private static async handleAddItemSubmit() {
        if (this.getCurrentRole() !== 'ADMIN') {
            ToastManager.show('Admin Access Required', 'Only administrators can add new components to the vault.', 'warning');
            return;
        }

        const name = (document.getElementById('item-name') as HTMLInputElement).value.trim();
        const category = (document.getElementById('item-category') as HTMLSelectElement).value;
        const qty = parseInt((document.getElementById('item-qty') as HTMLInputElement).value);
        const location = (document.getElementById('item-location') as HTMLInputElement).value.trim();
        const specs = (document.getElementById('item-specs') as HTMLTextAreaElement).value.trim() || "No specifications provided.";
        const rawTags = (document.getElementById('item-tags') as HTMLInputElement)?.value || '';
        const tags = rawTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

        if (!name || !category || isNaN(qty) || !location) {
            ToastManager.show('Missing Fields', 'Please complete all required fields.', 'warning');
            return;
        }

        if (qty <= 0) {
            ToastManager.show('Invalid Quantity', 'Total quantity must be at least 1.', 'warning');
            return;
        }

        const MAX_QUANTITY_LIMIT = 500;
        if (qty > MAX_QUANTITY_LIMIT) {
            ToastManager.show('Quantity Exceeds Limit', `Maximum quantity per component entry is capped at ${MAX_QUANTITY_LIMIT} units.`, 'warning');
            return;
        }

        const submitBtn = document.getElementById('btn-add-submit') as HTMLButtonElement;
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Vaulting Component...</span>`;
        }

        const catMap: Record<string, string> = {
            microcontrollers: 'Controllers',
            sensors: 'Sensors',
            actuators: 'Actuators',
            power: 'Power',
            tools: 'Tools'
        };
        const backendCategory = catMap[category] || 'Controllers';

        const token = localStorage.getItem('cicr_token');
        try {
            const res = await fetch(`${API_BASE}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    category: backendCategory,
                    quantity: qty,
                    location,
                    description: specs,
                    tags
                })
            });

            if (res.ok) {
                (document.getElementById('add-item-form') as HTMLFormElement).reset();
                this.close('add-item-modal');
                ToastManager.show('Component Vaulted', `Added ${qty}x ${name} to ${location}. Telemetry alert sent to administrators.`, 'success');
                DatabaseManager.addLog('add', `Registered new component <span>${name}</span> (Qty: ${qty}) at <span>${location}</span>.`);
                await DatabaseManager.syncFromBackend();
                return;
            } else {
                const errJson = await res.json();
                ToastManager.show('Action Failed', errJson.message || 'Failed to add item to database.', 'error');
            }
        } catch (e) {
            console.error('Failed to create item in backend:', e);
            ToastManager.show('Connection Error', 'Failed to reach database backend.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
                lucide.createIcons();
            }
        }

        // Fallback local addition if offline
        const id = `${category.slice(0, 2)}-${Date.now().toString().slice(-4)}`;
        const newItem: InventoryItem = {
            id,
            name,
            category,
            quantity: qty,
            availableQuantity: qty,
            location,
            specs,
            tags,
            borrowedBy: []
        };
        inventory.unshift(newItem);
        DatabaseManager.addLog('add', `Registered new component <span>${name}</span> (Qty: ${qty}) at <span>${location}</span>.`);
        (document.getElementById('add-item-form') as HTMLFormElement).reset();
        this.close('add-item-modal');
        ToastManager.show('Component Saved', `Stored ${qty}x ${name} locally`, 'info');
        if (window.dashboard) {
            window.dashboard.init();
        }
    }

    private static isSubmittingBorrow = false;

    private static async handleBorrowSubmit() {
        if (!selectedItem || this.isSubmittingBorrow) return;

        const borrowerName = (document.getElementById('borrow-name') as HTMLInputElement).value.trim();
        const rollNum = (document.getElementById('borrow-roll') as HTMLInputElement).value.trim();
        const qty = parseInt((document.getElementById('borrow-qty') as HTMLInputElement).value);
        const purpose = (document.getElementById('borrow-purpose') as HTMLInputElement).value.trim();

        const borrowedSum = (selectedItem.borrowedBy || [])
            .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            .reduce((sum, rec) => sum + rec.qty, 0);
        const available = typeof selectedItem.availableQuantity === 'number'
            ? selectedItem.availableQuantity
            : Math.max(0, selectedItem.quantity - borrowedSum);

        if (qty > available || qty <= 0 || isNaN(qty) || !borrowerName || !rollNum || !purpose) {
            ToastManager.show('Invalid Input', 'Please enter a valid borrow quantity within available limits.', 'warning');
            return;
        }

        const dueDateInput = document.getElementById('borrow-due-date') as HTMLInputElement | null;
        const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dueDate = (dueDateInput && dueDateInput.value) ? dueDateInput.value : defaultDue;

        let durationDays = 7;
        if (dueDate) {
            const t0 = new Date();
            t0.setHours(0, 0, 0, 0);
            const t1 = new Date(dueDate);
            t1.setHours(0, 0, 0, 0);
            const diff = Math.round((t1.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > 0) durationDays = diff;
        }

        const token = localStorage.getItem('cicr_token');
        if (!token) {
            ToastManager.show('Login Required', 'Please log in to submit a component issue request.', 'error');
            return;
        }

        const submitBtn = document.getElementById('borrow-form-submit') as HTMLButtonElement | null;
        this.isSubmittingBorrow = true;
        const isAdmin = this.getCurrentRole() === 'ADMIN';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = isAdmin ? 'Issuing Hardware...' : 'Submitting Request...';
        }

        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        const userEmail = storedUser.email || (localStorage.getItem('cicr_auth')?.includes('@') ? localStorage.getItem('cicr_auth') : (storedUser.roll_number ? `${storedUser.roll_number}@mail.jiit.ac.in` : 'admin@cicr.lab'));
        const studentEmail = (rollNum && /^\d+$/.test(rollNum))
            ? `${rollNum}@mail.jiit.ac.in`
            : (rollNum?.includes('@') ? rollNum : userEmail);

        if (isAdmin) {
            // Direct issue directly into student custody via POST /api/borrow
            const directPayload = {
                inventory_id: selectedItem.id,
                itemId: selectedItem.id,
                borrower_name: borrowerName,
                roll_number: rollNum,
                borrower_email: studentEmail,
                quantity: qty,
                purpose: purpose,
                duration_days: durationDays,
                durationDays: durationDays,
                dueDate: dueDate,
                due_date: dueDate
            };

            try {
                const res = await fetch(`${API_BASE}/borrow`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(directPayload)
                });

                const resData = await res.json().catch(() => ({})) as any;
                if (!res.ok) {
                    ToastManager.show('Issue Failed', resData?.message || 'Could not issue component.', 'error');
                    return;
                }

                // Update local inventory available quantity immediately
                const newAvailable = typeof resData?.data?.newAvailableQty === 'number'
                    ? resData.data.newAvailableQty
                    : Math.max(0, (selectedItem.availableQuantity ?? selectedItem.quantity) - qty);
                selectedItem.availableQuantity = newAvailable;

                if (!selectedItem.borrowedBy) selectedItem.borrowedBy = [];
                const recordId = resData?.data?.borrowRecord?.id || `borrow-${Date.now()}`;
                selectedItem.borrowedBy.push({
                    id: recordId,
                    name: borrowerName,
                    userName: borrowerName,
                    borrowerName: borrowerName,
                    roll: rollNum,
                    userRoll: rollNum,
                    email: studentEmail,
                    userEmail: studentEmail,
                    qty: qty,
                    purpose: purpose,
                    date: new Date().toISOString(),
                    dueDate: dueDate,
                    status: 'BORROWED',
                    returned: false
                });

                (document.getElementById('borrow-form') as HTMLFormElement).reset();
                this.close('borrow-form-modal');

                ToastManager.show(
                    'Component Issued',
                    `Successfully issued ${qty}x ${selectedItem.name} to ${borrowerName} (${rollNum}).`,
                    'success'
                );
                DatabaseManager.addLog('borrow', `<span>[Admin]</span> issued ${qty}x <span>${selectedItem.name}</span> to <strong>${borrowerName}</strong> (${rollNum}).`);

                await DatabaseManager.syncFromBackend();
                if (window.dashboard) {
                    window.dashboard.renderInventory(true);
                    window.dashboard.renderStats();
                }
            } catch (err: any) {
                console.error('Direct borrow error:', err);
                ToastManager.show('Network Error', 'Failed to connect to backend.', 'error');
            } finally {
                this.isSubmittingBorrow = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = isAdmin ? 'Confirm & Issue Hardware' : 'Submit Issue Request';
                }
            }
            return;
        }

        // Route component checkout request to the Admin Portal Request Queue for regular member
        const date = new Date().toISOString().split('T')[0];
        const requestId = `req-${Date.now()}`;
        const newReq: RequestRecord = {
            id: requestId,
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            name: borrowerName,
            roll: rollNum,
            qty: qty,
            purpose: purpose,
            status: 'PENDING',
            requestedAt: date,
            dueDate: dueDate
        };

        const requestPayload = {
            id: requestId,
            itemId: selectedItem.id,
            inventory_id: selectedItem.id,
            item_id: selectedItem.id,
            itemName: selectedItem.name,
            quantity: qty,
            purpose: purpose,
            duration_days: durationDays,
            durationDays: durationDays,
            dueDate: dueDate,
            due_date: dueDate,
            borrowerName: borrowerName,
            borrower_name: borrowerName,
            borrowerEmail: userEmail,
            borrower_email: userEmail,
            rollNumber: rollNum,
            roll_number: rollNum,
            status: 'PENDING'
        };

        try {
            const res = await fetch(`${API_BASE}/borrow/request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestPayload)
            });

            const resData = await res.json().catch(() => ({})) as any;
            if (resData?.data?.id) {
                newReq.id = resData.data.id;
            }

            // Always keep in local requests store so it is instantly reflected on this client, deduplicating against any existing match
            requests = requests.filter(r => r.id !== newReq.id && !(r.status === 'PENDING' && r.itemId === newReq.itemId && r.qty === newReq.qty && r.purpose === newReq.purpose));
            requests.unshift(newReq);
            DatabaseManager.save();

            (document.getElementById('borrow-form') as HTMLFormElement).reset();
            this.close('borrow-form-modal');

            ToastManager.show(
                'Request Transmitted',
                `Issue request for ${qty}x ${selectedItem.name} submitted for Admin authorization.`,
                'success'
            );
            DatabaseManager.addLog('borrow', `<span>${borrowerName}</span> requested ${qty}x <span>${selectedItem.name}</span> for '${purpose}'.`);
            AdminManager.loadHardwareRequests(true);
            DatabaseManager.updateNotificationBadges();
            await DatabaseManager.syncFromBackend();
        } catch (e: any) {
            console.error('Request API error:', e);
            // On offline/failover, save locally
            requests = requests.filter(r => r.id !== newReq.id && !(r.status === 'PENDING' && r.itemId === newReq.itemId && r.qty === newReq.qty && r.purpose === newReq.purpose));
            requests.unshift(newReq);
            DatabaseManager.save();
            (document.getElementById('borrow-form') as HTMLFormElement).reset();
            this.close('borrow-form-modal');
            ToastManager.show(
                'Request Transmitted',
                `Issue request for ${qty}x ${selectedItem.name} queued for Admin authorization.`,
                'success'
            );
            DatabaseManager.addLog('borrow', `<span>${borrowerName}</span> requested ${qty}x <span>${selectedItem.name}</span> for '${purpose}'.`);
            AdminManager.loadHardwareRequests(true);
        } finally {
            this.isSubmittingBorrow = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Submit Issue Request';
            }
        }
    }

    // Opens the return quantity selector. Admins directly restock items into vault inventory;
    // Members submit return requests for Admin verification.
    public static openReturnModal(rec: BorrowRecord, item: InventoryItem, origIdx: number) {
        selectedItem = item;
        const isAdmin = this.getCurrentRole() === 'ADMIN';

        if (!rec && item.borrowedBy && item.borrowedBy.length > 0) {
            rec = item.borrowedBy[0];
        }

        if (!rec) {
            ToastManager.show('No Active Loan', 'No active loan found for this component.', 'warning');
            return;
        }

        // Resolve borrowId if missing or unlinked
        let effectiveBorrowId = rec?.id;
        if (!effectiveBorrowId && typeof ProfileViewManager !== 'undefined' && Array.isArray(ProfileViewManager.cachedHistory)) {
            const match = ProfileViewManager.cachedHistory.find((h: any) =>
                String(h.inventory_id || h.inventory?.id) === String(item.id) &&
                (h.status === 'BORROWED' || h.status === 'RETURN_REQUESTED')
            );
            if (match?.id) effectiveBorrowId = match.id;
        }
        if (!effectiveBorrowId && rec) {
            effectiveBorrowId = (rec as any).borrowId || (rec as any)._id || item.id;
        }

        if (!effectiveBorrowId) {
            ToastManager.show('Return Unavailable', 'This loan is not linked to a server record yet.', 'warning');
            return;
        }

        // Strict ownership enforcement: only the person who issued the loan can return it (Admins can return any loan)
        if (!isAdmin && !ModalManager.isUserLoanMatch(rec)) {
            ToastManager.show('Return Prohibited', 'You can only initiate returns for components you have personally borrowed.', 'warning');
            return;
        }

        const borrowedQty = Math.max(1, Number(rec.qty) || 1);

        const nameEl = document.getElementById('return-modal-item-name');
        if (nameEl) nameEl.innerText = item.name;

        const holderInfo = document.getElementById('return-modal-holder-info');
        if (holderInfo) {
            holderInfo.innerText = `Borrower: ${rec.name || 'Member'} (${rec.roll || 'Enrolled'}) · Issued: ${borrowedQty} unit(s) on ${rec.date || 'Active'}`;
        }

        const returnIdInput = document.getElementById('return-borrow-id') as HTMLInputElement;
        if (returnIdInput) {
            returnIdInput.value = effectiveBorrowId;
            returnIdInput.dataset.itemId = item.id;
        }
        (document.getElementById('return-borrow-idx') as HTMLInputElement).value = String(origIdx);

        const formEl = document.getElementById('return-qty-form') as HTMLFormElement | null;
        if (formEl) {
            formEl.dataset.itemId = item.id;
        }

        const qtyInput = document.getElementById('return-qty-input') as HTMLInputElement;
        qtyInput.min = '1';
        qtyInput.max = String(borrowedQty);
        qtyInput.value = String(borrowedQty);

        const maxLabel = document.getElementById('return-qty-max-label');
        if (maxLabel) maxLabel.innerText = `of ${borrowedQty} borrowed`;

        const subtitle = document.getElementById('return-modal-subtitle');
        if (subtitle) {
            subtitle.innerText = isAdmin
                ? 'Admin Direct Restock · Return items to vault inventory'
                : 'Choose how many borrowed units you wish to return';
        }

        const noteText = document.getElementById('return-modal-note-text');
        if (noteText) {
            noteText.innerText = isAdmin
                ? 'Restocking will immediately return units to available vault inventory and close this active loan record.'
                : 'Return requests are sent to the Admin Portal for verification. Stock is checked back into inventory once approved by an administrator.';
        }

        const submitBtn = document.getElementById('btn-confirm-return-submit') as HTMLButtonElement | null;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = isAdmin
                ? '<i data-lucide="package-check"></i> Restock & Return to Vault'
                : '<i data-lucide="corner-up-left"></i> Submit Return to Admin';
        }

        ModalManager.updateReturnQtyPreview();
        this.open('return-qty-modal');
        lucide.createIcons();
    }

    private static isSubmittingReturn = false;

    // Submits a full or partial return. Routes via POST /borrow/return which immediately
    // restocks the vault for admins and registers a verification request for members.
    public static async handleReturnSubmission(borrowId: string, qtyVal: number, _idx: number) {
        if (!borrowId || this.isSubmittingReturn) {
            if (!borrowId) ToastManager.show('Return Error', 'Borrow reference is missing.', 'error');
            return;
        }

        if (!selectedItem) {
            const formEl = document.getElementById('return-qty-form') as HTMLFormElement | null;
            const itemId = formEl?.dataset.itemId;
            if (itemId) {
                selectedItem = inventory.find(i => String(i.id) === String(itemId)) || null;
            }
        }

        this.isSubmittingReturn = true;

        const isAdmin = this.getCurrentRole() === 'ADMIN';
        const token = localStorage.getItem('cicr_token');
        const submitBtn = document.getElementById('btn-confirm-return-submit') as HTMLButtonElement | null;
        const itemName = (document.getElementById('return-modal-item-name')?.innerText || selectedItem?.name || 'Component').trim();
        const requestedQty = Math.max(1, Number(qtyVal) || 1);

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = isAdmin ? 'Restocking Vault...' : 'Submitting Return...';
        }

        try {
            const endpoint = `${API_BASE}/borrow/return`;
            const payload = {
                borrow_id: borrowId,
                borrowId: borrowId,
                id: borrowId,
                itemId: selectedItem?.id,
                inventory_id: selectedItem?.id,
                returnQuantity: requestedQty,
                quantity: requestedQty
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const resData = await res.json().catch(() => ({})) as any;
            const isOk = res.ok || res.status === 200 || res.status === 202;

            if (!isOk) {
                ToastManager.show('Return Error', resData?.message || 'Failed to process return.', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = isAdmin ? '<i data-lucide="package-check"></i> Restock & Return to Vault' : '<i data-lucide="corner-up-left"></i> Submit Return to Admin';
                    renderLucideIcons(submitBtn);
                }
                return;
            }

            this.close('return-qty-modal');

            // If Admin (status 200) -> Direct Restock into Vault
            if (res.status === 200 || isAdmin) {
                if (selectedItem) {
                    const totalQty = Number(selectedItem.quantity) || 0;
                    selectedItem.availableQuantity = Math.min(totalQty, (selectedItem.availableQuantity ?? 0) + requestedQty);
                    if (selectedItem.borrowedBy) {
                        const rec = selectedItem.borrowedBy.find(r => r.id === borrowId || (r as any).borrowId === borrowId);
                        if (rec) {
                            if (requestedQty >= rec.qty) {
                                rec.returned = true;
                                (rec as any).status = 'RETURNED';
                            } else {
                                rec.qty -= requestedQty;
                            }
                        }
                    }
                }

                ToastManager.show(
                    'Component Restocked',
                    `Successfully returned ${requestedQty}x ${itemName} back into the vault.`,
                    'success'
                );
                DatabaseManager.addLog('return', `<span>[Admin]</span> restocked ${requestedQty}x <span>${itemName}</span> into vault inventory.`);
            } else {
                // Member (status 202) -> Return request submitted
                if (selectedItem && selectedItem.borrowedBy) {
                    const rec = selectedItem.borrowedBy.find(r => r.id === borrowId || (r as any).borrowId === borrowId);
                    if (rec) {
                        (rec as any).status = 'RETURN_REQUESTED';
                    }
                }

                ToastManager.show(
                    'Return Request Submitted',
                    `Return of ${requestedQty}x ${itemName} is awaiting Administrator approval in the Admin Portal.`,
                    'success'
                );
                DatabaseManager.addLog('return', `<span>${itemName}</span> return request submitted for ${requestedQty} unit(s) — pending admin approval.`);

                const localUser = (() => {
                    try { return JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch { return {}; }
                })();
                const returnId = resData?.data?.id || `req-ret-local-${Date.now()}`;
                const localReq: RequestRecord = {
                    id: returnId,
                    type: 'RETURN',
                    borrowId,
                    returnQuantity: requestedQty,
                    itemId: selectedItem?.id || '',
                    itemName,
                    name: localUser.name || localStorage.getItem('cicr_auth') || 'Member',
                    roll: localUser.roll_number || localUser.roll || '',
                    qty: requestedQty,
                    purpose: `Return ${requestedQty} unit(s)`,
                    status: 'PENDING',
                    requestedAt: new Date().toISOString()
                };
                requests = requests.filter(r => !(r.id === returnId || (r.type === 'RETURN' && (r as any).borrowId === borrowId)));
                requests.unshift(localReq);
                DatabaseManager.save();
            }

            await DatabaseManager.syncFromBackend();
            if (window.dashboard) {
                window.dashboard.renderInventory(true);
                window.dashboard.renderStats();
            }

            if (selectedItem) {
                const refreshed = inventory.find(i => i.id === selectedItem?.id);
                if (refreshed) this.openDetailModal(refreshed);
            }
            DatabaseManager.updateNotificationBadges();

            if (isAdmin && typeof AdminManager !== 'undefined' && typeof AdminManager.loadHardwareRequests === 'function') {
                AdminManager.loadHardwareRequests(true);
            }
        } catch (e) {
            console.error('Return API error:', e);
            ToastManager.show('Network Error', 'Failed to reach server.', 'error');
        } finally {
            this.isSubmittingReturn = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = isAdmin ? '<i data-lucide="package-check"></i> Restock & Return to Vault' : '<i data-lucide="corner-up-left"></i> Submit Return to Admin';
                renderLucideIcons(submitBtn);
            }
        }
    }

    // Opens the Consolidated Bulk Return Modal ("Return Everything in 1 Go")
    public static openBulkReturnModal() {
        const userLoansMap = new Map<string, { item: InventoryItem; records: BorrowRecord[]; totalQty: number }>();
        let totalIssuedUnits = 0;

        inventory.forEach(item => {
            (item.borrowedBy || []).forEach(rec => {
                if (!rec.returned && (rec as any).status !== 'RETURN_REQUESTED' && ModalManager.isUserLoanMatch(rec)) {
                    const existing = userLoansMap.get(item.id);
                    const qty = Math.max(1, Number(rec.qty) || 1);
                    totalIssuedUnits += qty;
                    if (existing) {
                        existing.records.push(rec);
                        existing.totalQty += qty;
                    } else {
                        userLoansMap.set(item.id, { item, records: [rec], totalQty: qty });
                    }
                }
            });
        });

        if (userLoansMap.size === 0) {
            ToastManager.show('No Active Loans', 'You do not have any active hardware loans available to return.', 'info');
            return;
        }

        const storedUser = (() => {
            try { return JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch { return {}; }
        })();
        const borrowerName = storedUser.name || localStorage.getItem('cicr_auth') || 'Member';
        let rollNum = storedUser.roll_number || storedUser.roll || '';
        if (!rollNum && storedUser.email) {
            const m = String(storedUser.email).match(/^([0-9]{6,12})@/);
            if (m) rollNum = m[1];
        }
        const borrowerEmail = storedUser.email || (rollNum ? `${rollNum}@mail.jiit.ac.in` : (localStorage.getItem('cicr_auth')?.includes('@') ? localStorage.getItem('cicr_auth') : ''));

        const nameEl = document.getElementById('bulk-return-borrower-name');
        if (nameEl) nameEl.innerText = borrowerName;

        const metaEl = document.getElementById('bulk-return-borrower-meta');
        if (metaEl) metaEl.innerText = `Roll: ${rollNum || 'Enrolled'} · ${borrowerEmail}`;

        const avatarEl = document.getElementById('bulk-return-avatar');
        if (avatarEl) avatarEl.innerText = borrowerName.charAt(0).toUpperCase();

        const totalIssuedEl = document.getElementById('bulk-total-issued-count');
        if (totalIssuedEl) totalIssuedEl.innerText = String(totalIssuedUnits);

        const listContainer = document.getElementById('bulk-return-items-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        const updateSummary = () => {
            let totalSelectedUnits = 0;
            let totalSelectedItems = 0;
            const rows = listContainer.querySelectorAll<HTMLElement>('.bulk-return-item-card');
            rows.forEach(row => {
                const input = row.querySelector<HTMLInputElement>('.bulk-stepper-input');
                const max = Number(row.dataset.maxQty || 0);
                const val = Math.max(0, Math.min(max, Number(input?.value || 0)));
                if (val > 0) {
                    totalSelectedUnits += val;
                    totalSelectedItems++;
                }

                const badge = row.querySelector<HTMLElement>('.bulk-status-badge');
                if (badge) {
                    if (val === 0) {
                        badge.className = 'bulk-status-badge bulk-status-zero';
                        badge.innerText = `Keep Issued (0/${max})`;
                    } else if (val === max) {
                        badge.className = 'bulk-status-badge bulk-status-full';
                        badge.innerText = `Full Return (${val}/${max})`;
                    } else {
                        badge.className = 'bulk-status-badge bulk-status-partial';
                        badge.innerText = `Partial (${val}/${max})`;
                    }
                }
            });

            const summaryCount = document.getElementById('bulk-summary-count');
            if (summaryCount) {
                summaryCount.innerText = `${totalSelectedItems} item${totalSelectedItems === 1 ? '' : 's'} (${totalSelectedUnits} unit${totalSelectedUnits === 1 ? '' : 's'})`;
            }

            const submitBtn = document.getElementById('btn-submit-bulk-return') as HTMLButtonElement | null;
            if (submitBtn) {
                submitBtn.disabled = totalSelectedUnits === 0;
                submitBtn.innerHTML = `<i data-lucide="corner-up-left"></i> Submit Return (${totalSelectedUnits} Units)`;
                lucide.createIcons();
            }
        };

        userLoansMap.forEach(({ item, totalQty }) => {
            const card = document.createElement('div');
            card.className = 'bulk-return-item-card';
            card.dataset.itemId = item.id;
            card.dataset.maxQty = String(totalQty);

            card.innerHTML = `
                <div class="bulk-item-left">
                    <div class="bulk-item-icon">
                        <i data-lucide="cpu"></i>
                    </div>
                    <div class="bulk-item-info">
                        <div class="bulk-item-name" title="${AdminManager.escapeHtml(item.name)}">${AdminManager.escapeHtml(item.name)}</div>
                        <div class="bulk-item-meta">${totalQty} unit${totalQty === 1 ? '' : 's'} currently issued</div>
                    </div>
                </div>
                <div class="bulk-item-right">
                    <span class="bulk-status-badge bulk-status-full">Full Return (${totalQty}/${totalQty})</span>
                    <div class="bulk-stepper-wrap">
                        <button type="button" class="bulk-stepper-btn btn-minus">-</button>
                        <input type="number" class="bulk-stepper-input" min="0" max="${totalQty}" value="${totalQty}">
                        <button type="button" class="bulk-stepper-btn btn-plus">+</button>
                    </div>
                </div>
            `;

            const input = card.querySelector<HTMLInputElement>('.bulk-stepper-input')!;
            const btnMinus = card.querySelector<HTMLButtonElement>('.btn-minus')!;
            const btnPlus = card.querySelector<HTMLButtonElement>('.btn-plus')!;

            btnMinus.addEventListener('click', () => {
                const cur = Number(input.value) || 0;
                if (cur > 0) {
                    input.value = String(cur - 1);
                    updateSummary();
                }
            });

            btnPlus.addEventListener('click', () => {
                const cur = Number(input.value) || 0;
                if (cur < totalQty) {
                    input.value = String(cur + 1);
                    updateSummary();
                }
            });

            input.addEventListener('input', () => {
                let v = Number(input.value);
                if (isNaN(v) || v < 0) v = 0;
                if (v > totalQty) v = totalQty;
                input.value = String(v);
                updateSummary();
            });

            const statusBadge = card.querySelector<HTMLElement>('.bulk-status-badge');
            if (statusBadge) {
                statusBadge.setAttribute('title', 'Click to toggle return quantity');
                statusBadge.addEventListener('click', () => {
                    const cur = Number(input.value) || 0;
                    input.value = cur > 0 ? '0' : String(totalQty);
                    updateSummary();
                });
            }

            listContainer.appendChild(card);
        });

        // Wire shortcut buttons
        const btnAll100 = document.getElementById('btn-bulk-return-all-100');
        if (btnAll100) {
            btnAll100.onclick = () => {
                listContainer.querySelectorAll<HTMLElement>('.bulk-return-item-card').forEach(row => {
                    const input = row.querySelector<HTMLInputElement>('.bulk-stepper-input');
                    const max = row.dataset.maxQty || '0';
                    if (input) input.value = max;
                });
                updateSummary();
            };
        }

        const btnResetZero = document.getElementById('btn-bulk-reset-zero');
        if (btnResetZero) {
            btnResetZero.onclick = () => {
                listContainer.querySelectorAll<HTMLElement>('.bulk-return-item-card').forEach(row => {
                    const input = row.querySelector<HTMLInputElement>('.bulk-stepper-input');
                    if (input) input.value = '0';
                });
                updateSummary();
            };
        }

        const cancelBtn = document.getElementById('btn-cancel-bulk-return');
        if (cancelBtn) {
            cancelBtn.onclick = () => this.close('bulk-return-modal');
        }

        const closeBtn = document.getElementById('close-bulk-return-modal');
        if (closeBtn) {
            closeBtn.onclick = () => this.close('bulk-return-modal');
        }

        const submitBtn = document.getElementById('btn-submit-bulk-return') as HTMLButtonElement | null;
        if (submitBtn) {
            submitBtn.onclick = async () => {
                await this.submitBulkReturn(listContainer);
            };
        }

        updateSummary();
        this.open('bulk-return-modal');
        lucide.createIcons();
    }

    public static async submitBulkReturn(listContainer: HTMLElement) {
        const itemsToReturn: Array<{ itemId: string; quantity: number }> = [];
        const rows = listContainer.querySelectorAll<HTMLElement>('.bulk-return-item-card');
        rows.forEach(row => {
            const itemId = row.dataset.itemId;
            const input = row.querySelector<HTMLInputElement>('.bulk-stepper-input');
            const qty = Math.max(0, Number(input?.value || 0));
            if (itemId && qty > 0) {
                itemsToReturn.push({ itemId, quantity: qty });
            }
        });

        if (itemsToReturn.length === 0) {
            ToastManager.show('No Items Selected', 'Please select at least 1 unit to return.', 'warning');
            return;
        }

        const submitBtn = document.getElementById('btn-submit-bulk-return') as HTMLButtonElement | null;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Submitting Dispatch...';
        }

        const token = localStorage.getItem('cicr_token');
        const isAdmin = this.getCurrentRole() === 'ADMIN';

        try {
            const res = await fetch(`${API_BASE}/borrow/bulk-return-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ items: itemsToReturn })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                ToastManager.show('Return Error', json.message || 'Failed to submit consolidated return.', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i data-lucide="corner-up-left"></i> Submit Return to Admin';
                }
                return;
            }

            this.close('bulk-return-modal');

            const totalQty = itemsToReturn.reduce((sum, it) => sum + it.quantity, 0);
            ToastManager.show(
                'Consolidated Return Submitted',
                `Return requests for ${itemsToReturn.length} component(s) (${totalQty} units) dispatched to Admin Portal for verification.`,
                'success'
            );
            DatabaseManager.addLog('return', `Consolidated return request submitted for ${itemsToReturn.length} item(s) (${totalQty} units) — pending admin approval.`);

            // Add local request records so UI immediately reflects pending return status
            const storedUser = (() => {
                try { return JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch { return {}; }
            })();
            const borrowerName = storedUser.name || localStorage.getItem('cicr_auth') || 'Member';
            const rollNum = storedUser.roll_number || storedUser.roll || '';

            itemsToReturn.forEach(({ itemId, quantity }) => {
                const targetItem = inventory.find(it => it.id === itemId);
                const localReq: RequestRecord = {
                    id: `req-ret-bulk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    type: 'RETURN',
                    itemId,
                    itemName: targetItem?.name || 'Component',
                    name: borrowerName,
                    roll: rollNum,
                    qty: quantity,
                    purpose: `Return ${quantity} unit(s) (Consolidated)`,
                    status: 'PENDING',
                    requestedAt: new Date().toISOString()
                };
                requests.unshift(localReq);
            });
            DatabaseManager.save();

            await DatabaseManager.syncFromBackend();
            DatabaseManager.updateNotificationBadges();

            if (isAdmin) {
                AdminManager.loadHardwareRequests(true);
            }
        } catch (err: any) {
            console.error('Bulk return submission error:', err);
            ToastManager.show('Network Error', 'Failed to connect to backend server.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="corner-up-left"></i> Submit Return to Admin';
                lucide.createIcons();
            }
        }
    }
}

// ==========================================
// 6. User Authentication & Admin Approval Manager
// ==========================================
class AuthManager {
    private static loginForm: HTMLFormElement;
    private static signupForm: HTMLFormElement;
    private static authOverlay: HTMLElement;
    private static appContainer: HTMLElement;
    private static globalNavbar: HTMLElement;

    private static loginUserInp: HTMLInputElement;
    private static loginPassInp: HTMLInputElement;
    private static loginErr: HTMLElement;

    private static signupNameInp: HTMLInputElement;
    private static signupEmailInp: HTMLInputElement;
    private static signupUserInp: HTMLInputElement;
    private static signupEnrollmentInp: HTMLInputElement;
    private static signupBatchInp: HTMLInputElement;
    private static signupPassInp: HTMLInputElement;
    private static signupErr: HTMLElement;
    private static signupSuccess: HTMLElement;

    private static navUsername: HTMLElement;
    private static navLogoutBtn: HTMLElement;

    static init() {
        this.loginForm = document.getElementById('login-form') as HTMLFormElement;
        this.signupForm = document.getElementById('signup-form') as HTMLFormElement;
        this.authOverlay = document.getElementById('auth-overlay')!;
        this.appContainer = document.getElementById('app-container')!;
        this.globalNavbar = document.getElementById('global-navbar')!;

        this.loginUserInp = document.getElementById('login-username') as HTMLInputElement;
        this.loginPassInp = document.getElementById('login-password') as HTMLInputElement;
        this.loginErr = document.getElementById('login-error')!;

        this.signupNameInp = document.getElementById('signup-name') as HTMLInputElement;
        this.signupEmailInp = document.getElementById('signup-email') as HTMLInputElement;
        this.signupUserInp = document.getElementById('signup-username') as HTMLInputElement;
        this.signupEnrollmentInp = document.getElementById('signup-enrollment') as HTMLInputElement;
        this.signupBatchInp = document.getElementById('signup-batch') as HTMLInputElement;
        this.signupPassInp = document.getElementById('signup-password') as HTMLInputElement;
        this.signupErr = document.getElementById('signup-error')!;
        this.signupSuccess = document.getElementById('signup-success')!;

        this.navUsername = document.getElementById('nav-username')!;
        this.navLogoutBtn = document.getElementById('nav-logout')!;

        const sideLogoutBtn = document.getElementById('sidebar-logout-btn');
        if (sideLogoutBtn) {
            sideLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.promptLogout();
            });
        }

        this.updateAdminVisibility(ModalManager.getCurrentRole());
        PasswordResetManager.init();
        this.setupInactivityTracker();
        this.setupEventListeners();
        this.checkAuth();
    }

    // Inactivity Tracking Configuration: 15-minute persistence and timeout rule
    private static readonly INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes (900,000 ms)
    private static lastActivityRecordedAt = 0;
    private static inactivityTimer: any = null;

    private static recordActivity(immediate: boolean = false) {
        const now = Date.now();
        // Throttle updates unless immediate (e.g. login, unload, tab switch)
        if (immediate || now - this.lastActivityRecordedAt > 5000) {
            this.lastActivityRecordedAt = now;
            try {
                localStorage.setItem('cicr_last_active', now.toString());
            } catch { }
        }
    }

    private static checkInactivityExpired(): boolean {
        const token = localStorage.getItem('cicr_token');
        if (!token) return false;

        const lastActiveStr = localStorage.getItem('cicr_last_active');
        if (!lastActiveStr) {
            // First time or legacy session with token: initialize activity timestamp now
            this.recordActivity(true);
            return false;
        }

        const lastActive = parseInt(lastActiveStr, 10);
        if (isNaN(lastActive) || lastActive <= 0) return false;

        const elapsed = Date.now() - lastActive;
        return elapsed > this.INACTIVITY_LIMIT_MS;
    }

    private static handleInactivityTimeout() {
        console.warn('Session expired due to 15 minutes of inactivity.');
        this.handleLogout(true);
    }

    private static setupInactivityTracker() {
        let lastActivityCheck = 0;
        const onUserActivity = () => {
            const now = Date.now();
            if (now - lastActivityCheck < 10000) return;
            lastActivityCheck = now;
            if (localStorage.getItem('cicr_token')) {
                this.recordActivity(false);
            }
        };

        // Window & document activity triggers
        window.addEventListener('pointerdown', onUserActivity, { passive: true });
        window.addEventListener('keydown', onUserActivity, { passive: true });
        window.addEventListener('scroll', onUserActivity, { passive: true });
        window.addEventListener('touchstart', onUserActivity, { passive: true });

        // Record timestamp when page unloads or is hidden (closing browser or switching tabs)
        window.addEventListener('beforeunload', () => {
            if (localStorage.getItem('cicr_token')) {
                this.recordActivity(true);
            }
        });
        window.addEventListener('pagehide', () => {
            if (localStorage.getItem('cicr_token')) {
                this.recordActivity(true);
            }
        });

        // Check timeout when user returns to this tab
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (localStorage.getItem('cicr_token')) {
                    if (this.checkInactivityExpired()) {
                        this.handleInactivityTimeout();
                    } else {
                        this.recordActivity(true);
                    }
                }
            } else if (document.visibilityState === 'hidden') {
                if (localStorage.getItem('cicr_token')) {
                    this.recordActivity(true);
                }
            }
        });

        // Background interval check every 15 seconds while tab is open
        if (this.inactivityTimer) clearInterval(this.inactivityTimer);
        this.inactivityTimer = setInterval(() => {
            if (localStorage.getItem('cicr_token')) {
                if (this.checkInactivityExpired()) {
                    this.handleInactivityTimeout();
                }
            }
        }, 15000);
    }

    private static setupEventListeners() {
        const authCard = document.querySelector('.auth-card') as HTMLElement | null;
        const tabLoginBtn = document.getElementById('tab-login-btn');
        const tabSignupBtn = document.getElementById('tab-signup-btn');

        const switchToLogin = () => {
            this.signupForm.style.display = 'none';
            this.loginForm.style.display = 'block';
            this.signupErr.style.display = 'none';
            this.signupSuccess.style.display = 'none';
            this.loginForm.reset();
            authCard?.classList.remove('auth-card-wide');
            tabLoginBtn?.classList.add('active');
            tabSignupBtn?.classList.remove('active');
        };

        const switchToSignup = () => {
            this.loginForm.style.display = 'none';
            this.signupForm.style.display = 'block';
            this.loginErr.style.display = 'none';
            this.signupForm.reset();
            authCard?.classList.add('auth-card-wide');
            tabSignupBtn?.classList.add('active');
            tabLoginBtn?.classList.remove('active');
        };

        document.getElementById('go-to-signup')?.addEventListener('click', (e) => {
            e.preventDefault();
            switchToSignup();
        });

        document.getElementById('go-to-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            switchToLogin();
        });

        document.getElementById('btn-open-forgot-password')?.addEventListener('click', (e) => {
            e.preventDefault();
            PasswordResetManager.open();
        });

        document.getElementById('sidebar-reset-pass-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            PasswordResetManager.open();
        });

        tabLoginBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            switchToLogin();
        });

        tabSignupBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            switchToSignup();
        });

        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        this.signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSignup();
        });

        this.navLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.promptLogout();
        });

        // Password visibility toggles (tactile button frame & reliable icon swap)
        const setupPasswordToggle = (toggleBtnId: string, inputId: string) => {
            const toggleBtn = document.getElementById(toggleBtnId);
            const passInput = document.getElementById(inputId) as HTMLInputElement | null;
            if (toggleBtn && passInput && !toggleBtn.dataset.bound) {
                toggleBtn.dataset.bound = 'true';
                toggleBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isPassword = passInput.getAttribute('type') === 'password';
                    const newType = isPassword ? 'text' : 'password';
                    passInput.setAttribute('type', newType);
                    toggleBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
                    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
                    toggleBtn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
                    if ((window as any).lucide && (window as any).lucide.createIcons) {
                        (window as any).lucide.createIcons();
                    }
                });
            }
        };

        setupPasswordToggle('login-password-toggle', 'login-password');
        setupPasswordToggle('signup-password-toggle', 'signup-password');
    }

    private static async checkAuth() {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        const token = localStorage.getItem('cicr_token');
        if (!token) {
            this.showLoginOverlay();
            return;
        }

        // Check if user session has been inactive or away for more than 15 minutes
        if (this.checkInactivityExpired()) {
            this.handleInactivityTimeout();
            return;
        }

        // Within 15 minutes: active session preserved, refresh activity timestamp
        this.recordActivity(true);

        // Instant session activation: eliminates auth modal flash on page reload
        const cachedUserStr = localStorage.getItem('cicr_user');
        const cachedAuth = localStorage.getItem('cicr_auth');
        const cachedRole = (localStorage.getItem('cicr_role') as UserRole) || 'MEMBER';
        let userObj = null;
        try { if (cachedUserStr) userObj = JSON.parse(cachedUserStr); } catch { }
        const fallbackName = userObj?.name || cachedAuth || 'Operator';
        this.loginSuccess(fallbackName, cachedRole, userObj);

        try {
            const res = await fetch(`${API_BASE}/auth/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const result = await res.json();
                const user = result.data;
                if (user) {
                    this.loginSuccess(user.name, user.role, user);
                    const welcomedKey = 'cicr_welcomed_' + (user.name || 'user');
                    if (!sessionStorage.getItem(welcomedKey)) {
                        sessionStorage.setItem(welcomedKey, 'true');
                        ToastManager.showWelcome(user.name, user.role);
                    }
                    return;
                }
            } else if (res.status === 401 || res.status === 403) {
                console.warn('[CICR Auth] Session invalid or expired (401/403). Clearing session.');
                this.handleLogout();
                return;
            }
        } catch (err) {
            console.warn('Profile validation check deferred (offline / backend initializing):', err);
        }
    }

    public static showLoginOverlay() {
        document.documentElement.classList.remove('is-authenticated');
        document.documentElement.classList.add('is-unauthenticated');
        document.body.classList.remove('authenticated');
        document.body.classList.add('auth-overlay-active');
        this.globalNavbar.style.setProperty('display', 'none', 'important');
        this.authOverlay.classList.remove('hidden');
        this.authOverlay.style.setProperty('display', 'flex', 'important');
        this.appContainer.classList.add('hidden');
        this.appContainer.style.setProperty('display', 'none', 'important');
        this.updateAdminVisibility('MEMBER');

        // Reset to default sign-in state
        this.signupForm.style.display = 'none';
        this.loginForm.style.display = 'block';
        document.querySelector('.auth-card')?.classList.remove('auth-card-wide');
        document.getElementById('tab-login-btn')?.classList.add('active');
        document.getElementById('tab-signup-btn')?.classList.remove('active');
    }

    private static isAllowedEmail(email: string): boolean {
        const norm = email.trim().toLowerCase();
        // Allow valid email addresses through to backend authentication API
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm);
    }

    private static async handleLogin() {
        const identifier = this.loginUserInp.value.trim();
        const password = this.loginPassInp.value;

        // Clear sensitive plaintext password from DOM memory immediately
        this.loginPassInp.value = '';
        this.loginErr.style.display = 'none';

        if (!identifier || !password) {
            this.showLoginError("Please enter your Email, Username, or Name, and Password.");
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-login') as HTMLButtonElement | null;
        const origSubmitHtml = btnSubmit ? btnSubmit.innerHTML : '';
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Signing In...';
            if ((window as any).lucide) (window as any).lucide.createIcons();
        }

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, email: identifier, username: identifier, name: identifier, password }),
            });

            const data = await res.json();

            if (res.ok && data.token) {
                localStorage.setItem('cicr_token', data.token);
                if (data.user) {
                    localStorage.setItem('cicr_user', JSON.stringify(data.user));
                }
                const resolvedName = data.user?.name || identifier;
                const role = data.user?.role || 'MEMBER';
                this.loginSuccess(resolvedName, role, data.user);
                sessionStorage.setItem('cicr_welcomed_' + resolvedName, 'true');
                ToastManager.showWelcome(resolvedName, role);
                return;
            }

            if (data.status === 'pending_approval') {
                this.showLoginError(data.message || "Access Pending: Your account has been registered and is awaiting approval by the CICR Admin.");
                return;
            }

            if (data.status === 'rejected') {
                this.showLoginError(data.message || "Access Denied: Your account registration was rejected by the CICR Admin.");
                return;
            }

            const errorMsg = data.errors?.[0]?.message || data.message || "Invalid credentials. Please check your email, username, or name and password.";
            this.showLoginError(errorMsg);
        } catch (err) {
            this.showLoginError("Unable to reach backend server. Please verify your connection.");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = origSubmitHtml;
                if ((window as any).lucide) (window as any).lucide.createIcons();
            }
        }
    }

    private static showLoginError(msg: string) {
        this.loginErr.innerText = msg;
        this.loginErr.style.display = 'block';
        this.loginErr.style.animation = 'none';
        this.loginErr.offsetHeight;
        this.loginErr.style.animation = 'shake-error 0.4s ease';
    }

    private static loginSuccess(username: string, role: string = 'MEMBER', _userObj?: any) {
        this.recordActivity(true);
        let effectiveRole: 'ADMIN' | 'MEMBER' = 'MEMBER';
        if (role === 'ADMIN' || _userObj?.role === 'ADMIN') {
            effectiveRole = 'ADMIN';
        } else {
            effectiveRole = 'MEMBER';
        }

        localStorage.setItem('cicr_auth', username);
        localStorage.setItem('cicr_role', effectiveRole);
        if (_userObj) {
            localStorage.setItem('cicr_user', JSON.stringify({ ..._userObj, role: effectiveRole }));
        }

        if (this.navUsername) {
            this.navUsername.innerText = username;
        }

        // Set username, role, initial, and avatar in the left sidebar profile card
        const profileUserDisplay = document.getElementById('profile-username-display');
        const profileAvatarInitial = document.getElementById('profile-avatar-initial');
        const sidebarAvatarImg = document.getElementById('sidebar-avatar-img') as HTMLImageElement;
        const profileRoleDisplay = document.querySelector('.sidebar-profile-box .profile-role') as HTMLElement;

        if (profileUserDisplay) profileUserDisplay.innerText = username;
        if (sidebarAvatarImg && profileAvatarInitial) {
            if (_userObj?.avatar_url) {
                sidebarAvatarImg.src = _userObj.avatar_url;
                sidebarAvatarImg.style.display = 'block';
                profileAvatarInitial.style.display = 'none';
            } else {
                sidebarAvatarImg.src = '';
                sidebarAvatarImg.style.display = 'none';
                profileAvatarInitial.style.display = 'flex';
                const initialTextEl = document.getElementById('sidebar-avatar-initial-text');
                if (initialTextEl) {
                    initialTextEl.textContent = (username.charAt(0) || 'U').toUpperCase();
                    initialTextEl.style.display = 'flex';
                } else {
                    profileAvatarInitial.textContent = (username.charAt(0) || 'U').toUpperCase();
                }
            }
        } else if (profileAvatarInitial) {
            profileAvatarInitial.style.display = 'flex';
            const initialTextEl = document.getElementById('sidebar-avatar-initial-text');
            if (initialTextEl) {
                initialTextEl.textContent = (username.charAt(0) || 'U').toUpperCase();
                initialTextEl.style.display = 'flex';
            } else {
                profileAvatarInitial.textContent = (username.charAt(0) || 'U').toUpperCase();
            }
        }
        if (profileRoleDisplay) {
            profileRoleDisplay.innerText = effectiveRole;
            if (effectiveRole === 'ADMIN') {
                profileRoleDisplay.style.color = '#ff007a';
            } else {
                profileRoleDisplay.style.color = 'var(--neon-cyan)';
            }
        }

        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        document.documentElement.classList.add('is-authenticated');
        document.documentElement.classList.remove('is-unauthenticated');
        document.body.classList.remove('auth-overlay-active');
        document.body.classList.add('authenticated');

        // Directly transition: hide auth form, show app container
        this.authOverlay.classList.add('hidden');
        this.authOverlay.style.setProperty('display', 'none', 'important');
        this.appContainer.classList.remove('hidden');
        this.appContainer.style.setProperty('display', 'grid', 'important');
        this.globalNavbar.style.setProperty('display', 'none', 'important');
        (window as any).syncFixedSidebarPosition?.();

        // Show/Hide Admin Portal navigation & cards based strictly on role
        this.updateAdminVisibility(effectiveRole);

        // Select Dashboard link in the left sidebar by default
        const activeNavClass = () => {
            const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
            sidebarLinks.forEach(link => {
                const target = (link as HTMLElement).dataset.target;
                if (target === 'dashboard-view') {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
            const sections = document.querySelectorAll('#app-main-content > section');
            sections.forEach(node => {
                const sec = node as HTMLElement;
                if (sec.id === 'dashboard-view') {
                    sec.classList.add('active');
                    sec.style.display = 'flex';
                } else {
                    sec.classList.remove('active');
                    sec.style.display = 'none';
                }
            });



            const breadcrumbActive = document.getElementById('breadcrumb-current');
            if (breadcrumbActive) breadcrumbActive.innerText = 'DASHBOARD';
        };
        activeNavClass();

        if (!window.dashboard) {
            window.dashboard = new DashboardManager();
        } else {
            window.dashboard.init();
        }
        renderLucideIcons();
        TerminalSimulator.start();

        if (effectiveRole === 'ADMIN') {
            AdminManager.init();
        }
    }

    public static updateAdminVisibility(role?: string) {
        const sideAdminLink = document.getElementById('side-nav-admin');
        const dashAdminCard = document.getElementById('dash-card-admin');
        const adminViewSection = document.getElementById('admin-view');
        const btnInventoryAdd = document.getElementById('btn-inventory-add-item');

        const sideHwLogsLink = document.getElementById('side-nav-hardware-logs');
        const dashHwLogsCard = document.getElementById('dash-card-hardware-logs');
        const navHwLogsLink = document.getElementById('nav-hardware-logs');
        const hwLogsSection = document.getElementById('hardware-logs-view');

        const activeRole = role !== undefined ? role : ModalManager.getCurrentRole();
        const isAdmin = activeRole === 'ADMIN';

        const roleSubtitleEl = document.getElementById('dashboard-subtitle-role');
        if (roleSubtitleEl) {
            roleSubtitleEl.innerText = isAdmin ? 'ADMIN DASHBOARD' : 'MEMBER DASHBOARD';
        }

        if (isAdmin) {
            document.body.classList.add('user-is-admin');
            if (sideAdminLink) {
                sideAdminLink.style.removeProperty('display');
                sideAdminLink.style.setProperty('display', 'flex', 'important');
            }
            if (dashAdminCard) {
                dashAdminCard.style.removeProperty('display');
                dashAdminCard.style.setProperty('display', 'flex', 'important');
            }
            if (btnInventoryAdd) {
                btnInventoryAdd.style.removeProperty('display');
                btnInventoryAdd.style.setProperty('display', 'inline-flex', 'important');
            }
            if (adminViewSection) {
                adminViewSection.style.removeProperty('display');
            }
            if (sideHwLogsLink) {
                sideHwLogsLink.style.removeProperty('display');
                sideHwLogsLink.style.setProperty('display', 'flex', 'important');
            }
            if (dashHwLogsCard) {
                dashHwLogsCard.style.removeProperty('display');
                dashHwLogsCard.style.setProperty('display', 'flex', 'important');
            }
            if (navHwLogsLink) {
                navHwLogsLink.style.removeProperty('display');
                navHwLogsLink.style.setProperty('display', 'inline-flex', 'important');
            }
            if (hwLogsSection) {
                hwLogsSection.style.removeProperty('display');
            }
            AdminManager.init();
        } else {
            document.body.classList.remove('user-is-admin');
            if (sideAdminLink) {
                sideAdminLink.style.setProperty('display', 'none', 'important');
            }
            if (dashAdminCard) {
                dashAdminCard.style.setProperty('display', 'none', 'important');
            }
            if (btnInventoryAdd) {
                btnInventoryAdd.style.setProperty('display', 'none', 'important');
            }
            if (adminViewSection) {
                adminViewSection.style.setProperty('display', 'none', 'important');
                adminViewSection.classList.remove('active');
            }
            if (sideHwLogsLink) {
                sideHwLogsLink.style.setProperty('display', 'none', 'important');
            }
            if (dashHwLogsCard) {
                dashHwLogsCard.style.setProperty('display', 'none', 'important');
            }
            if (navHwLogsLink) {
                navHwLogsLink.style.setProperty('display', 'none', 'important');
            }
            if (hwLogsSection) {
                hwLogsSection.style.setProperty('display', 'none', 'important');
                hwLogsSection.classList.remove('active');
            }
            // Auto-redirect if non-admin is currently attempting to view restricted sections
            const curActive = document.querySelector('.main-viewport > section.active');
            if (curActive && (curActive.id === 'admin-view' || curActive.id === 'hardware-logs-view')) {
                if ((window as any).switchSection) {
                    (window as any).switchSection('dashboard-view');
                }
            }
        }

        if (window.dashboard) {
            window.dashboard.renderInventory(true);
        }
    }

    private static async handleSignup() {
        const name = (this.signupNameInp ? this.signupNameInp.value : '').trim();
        const email = (this.signupEmailInp ? this.signupEmailInp.value : '').trim();
        const username = (this.signupUserInp ? this.signupUserInp.value : '').trim();
        const enrollment = (this.signupEnrollmentInp ? this.signupEnrollmentInp.value : '').trim();
        const batch = (this.signupBatchInp ? this.signupBatchInp.value : '').trim();
        const password = this.signupPassInp ? this.signupPassInp.value : '';
        const confirmPassInp = document.getElementById('signup-confirm-password') as HTMLInputElement | null;
        const confirmPassword = confirmPassInp ? confirmPassInp.value : '';

        this.signupErr.style.display = 'none';
        this.signupSuccess.style.display = 'none';

        if (name.length < 2) {
            this.showSignupError("Please enter your full name.");
            return;
        }

        if (!email || !email.includes('@')) {
            this.showSignupError("Please provide a valid email address.");
            return;
        }

        if (!this.isAllowedEmail(email)) {
            this.showSignupError("Registration Restricted: Only official JIIT student accounts (enrollmentnumber@mail.jiit.ac.in) can create an account.");
            return;
        }

        if (username.length < 3) {
            this.showSignupError("Username must be at least 3 characters.");
            return;
        }

        if (enrollment.length < 4) {
            this.showSignupError("Please enter a valid enrollment number.");
            return;
        }

        if (!batch) {
            this.showSignupError("Please enter your academic branch (e.g. CSE / ECE / IT).");
            return;
        }

        if (password.length < 6) {
            this.showSignupError("Password must be at least 6 characters.");
            return;
        }

        if (password !== confirmPassword) {
            this.showSignupError("Passwords do not match. Please verify and re-type.");
            return;
        }

        // Clear sensitive plaintext password from DOM memory immediately
        this.signupPassInp.value = '';
        if (confirmPassInp) confirmPassInp.value = '';

        const btnSubmit = document.getElementById('btn-submit-signup') as HTMLButtonElement | null;
        const origSubmitHtml = btnSubmit ? btnSubmit.innerHTML : '';
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Registering...';
            if ((window as any).lucide) (window as any).lucide.createIcons();
        }

        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    username,
                    roll_number: enrollment,
                    batch,
                    password
                }),
            });

            const data = await res.json();

            if (res.ok || data.status === 'success') {
                this.signupSuccess.innerText = data.message || "Registration request submitted! Your account is pending CICR Admin approval.";
                this.signupSuccess.style.display = 'block';

                DatabaseManager.addLog('system', `Registration requested: <span>${name}</span> (@${username}, ${email}, Branch: ${batch}).`);

                setTimeout(() => {
                    document.getElementById('go-to-login')!.click();
                }, 2200);
                return;
            }

            this.showSignupError(data.message || "Registration failed. Please check your information.");
        } catch (err) {
            this.showSignupError("Unable to reach backend server. Please verify your connection.");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = origSubmitHtml;
                if ((window as any).lucide) (window as any).lucide.createIcons();
            }
        }
    }

    private static showSignupError(msg: string) {
        this.signupErr.innerText = msg;
        this.signupErr.style.display = 'block';
        this.signupErr.style.animation = 'none';
        this.signupErr.offsetHeight;
        this.signupErr.style.animation = 'shake-error 0.4s ease';
    }

    public static promptLogout() {
        const modal = document.getElementById('signout-confirm-modal');
        if (!modal) {
            this.handleLogout();
            return;
        }

        // Populate user preview details
        let user: any = {};
        try {
            user = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        } catch { }
        const nameEl = document.getElementById('signout-user-name');
        const emailEl = document.getElementById('signout-user-email');
        const roleEl = document.getElementById('signout-user-role');
        const avatarEl = document.getElementById('signout-user-avatar');

        const userName = user?.name || user?.username || localStorage.getItem('cicr_auth') || 'Member';
        const userRoll = user?.roll_number || user?.roll || '';
        const userEmail = user?.email || (userRoll ? `${userRoll}@mail.jiit.ac.in` : (localStorage.getItem('cicr_auth')?.includes('@') ? localStorage.getItem('cicr_auth') : 'member@mail.jiit.ac.in'));
        const userRole = (user?.role || localStorage.getItem('cicr_role') || 'MEMBER').toUpperCase();

        if (nameEl) nameEl.innerText = userName;
        if (emailEl) emailEl.innerText = userEmail;
        if (roleEl) roleEl.innerText = userRole === 'ADMIN' ? 'VAULT ADMIN' : 'STUDENT MEMBER';
        if (avatarEl) avatarEl.innerText = userName.charAt(0).toUpperCase();

        modal.classList.add('active');
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
        lucide.createIcons();

        const closeBtn = document.getElementById('close-signout-confirm');
        const cancelBtn = document.getElementById('btn-cancel-signout');
        const confirmBtn = document.getElementById('btn-confirm-signout');

        const closeModal = () => {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.classList.remove('active');
                modal.style.display = 'none';
            }, 250);
        };

        if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); closeModal(); };
        if (cancelBtn) cancelBtn.onclick = (e) => { e.stopPropagation(); closeModal(); };
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        if (confirmBtn) {
            confirmBtn.onclick = (e) => {
                e.stopPropagation();
                closeModal();
                ToastManager.show('Session Terminated', 'You have been disconnected safely.', 'info');
                this.handleLogout();
            };
        }
    }

    public static handleLogout(isTimeout: boolean = false) {
        const token = localStorage.getItem('cicr_token');
        if (token) {
            try {
                fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(() => {});
            } catch {}
        }

        localStorage.removeItem('cicr_auth');
        localStorage.removeItem('cicr_role');
        localStorage.removeItem('cicr_token');
        localStorage.removeItem('cicr_user');
        localStorage.removeItem('cicr_last_active');
        localStorage.removeItem('cicr_cart_items');
        localStorage.removeItem('cicr_pending_returns');
        sessionStorage.clear();

        if (typeof CartManager !== 'undefined') {
            CartManager.clearCart();
        }

        document.documentElement.classList.remove('is-authenticated');
        document.documentElement.classList.add('is-unauthenticated');
        document.body.classList.remove('authenticated');
        document.body.classList.add('auth-overlay-active');

        this.updateAdminVisibility('MEMBER');

        this.appContainer.classList.add('hidden');
        this.appContainer.style.setProperty('display', 'none', 'important');
        this.globalNavbar.style.setProperty('display', 'none', 'important');

        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            welcomeScreen.style.transform = 'translateY(0)';
        }

        this.authOverlay.style.setProperty('display', 'flex', 'important');
        setTimeout(() => {
            this.authOverlay.classList.remove('hidden');
        }, 50);

        this.loginForm.reset();
        this.loginErr.style.display = 'none';

        if (isTimeout) {
            setTimeout(() => {
                if (typeof ToastManager !== 'undefined' && ToastManager.show) {
                    ToastManager.show('Session Expired', 'You were away or inactive for more than 15 minutes. Please sign in again.', 'warning');
                }
            }, 120);
        }
    }
}

// ==========================================
// 6.5 Password Reset & Credential Sync Manager (No OTP)
// ==========================================
class PasswordResetManager {
    private static resetModal: HTMLElement | null = null;
    private static directForm: HTMLFormElement | null = null;
    private static identifierInput: HTMLInputElement | null = null;
    private static currentPassInput: HTMLInputElement | null = null;
    private static newPassInput: HTMLInputElement | null = null;
    private static confirmPassInput: HTMLInputElement | null = null;
    private static errorEl: HTMLElement | null = null;

    static init() {
        this.resetModal = document.getElementById('reset-password-modal');
        this.directForm = document.getElementById('reset-direct-form') as HTMLFormElement | null;
        this.identifierInput = document.getElementById('reset-identifier') as HTMLInputElement | null;
        this.currentPassInput = document.getElementById('reset-current-password') as HTMLInputElement | null;
        this.newPassInput = document.getElementById('reset-new-password') as HTMLInputElement | null;
        this.confirmPassInput = document.getElementById('reset-confirm-password') as HTMLInputElement | null;
        this.errorEl = document.getElementById('reset-error');

        // Password visibility toggles
        const currentPassToggle = document.getElementById('reset-current-pass-toggle');
        if (currentPassToggle && this.currentPassInput && !currentPassToggle.dataset.bound) {
            currentPassToggle.dataset.bound = 'true';
            currentPassToggle.addEventListener('click', (e) => {
                e.preventDefault();
                if (!this.currentPassInput) return;
                const isPass = this.currentPassInput.type === 'password';
                this.currentPassInput.type = isPass ? 'text' : 'password';
                currentPassToggle.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}"></i>`;
                if ((window as any).lucide && (window as any).lucide.createIcons) {
                    (window as any).lucide.createIcons();
                }
            });
        }

        const newPassToggle = document.getElementById('reset-new-pass-toggle');
        if (newPassToggle && this.newPassInput && !newPassToggle.dataset.bound) {
            newPassToggle.dataset.bound = 'true';
            newPassToggle.addEventListener('click', (e) => {
                e.preventDefault();
                if (!this.newPassInput) return;
                const isPass = this.newPassInput.type === 'password';
                this.newPassInput.type = isPass ? 'text' : 'password';
                newPassToggle.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}"></i>`;
                if ((window as any).lucide && (window as any).lucide.createIcons) {
                    (window as any).lucide.createIcons();
                }
            });
        }

        const confirmPassToggle = document.getElementById('reset-confirm-pass-toggle');
        if (confirmPassToggle && this.confirmPassInput && !confirmPassToggle.dataset.bound) {
            confirmPassToggle.dataset.bound = 'true';
            confirmPassToggle.addEventListener('click', (e) => {
                e.preventDefault();
                if (!this.confirmPassInput) return;
                const isPass = this.confirmPassInput.type === 'password';
                this.confirmPassInput.type = isPass ? 'text' : 'password';
                confirmPassToggle.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}"></i>`;
                if ((window as any).lucide && (window as any).lucide.createIcons) {
                    (window as any).lucide.createIcons();
                }
            });
        }

        if (this.directForm && !this.directForm.dataset.bound) {
            this.directForm.dataset.bound = 'true';
            this.directForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleDirectReset();
            });
        }

        const submitResetBtn = document.getElementById('btn-submit-reset-direct');
        if (submitResetBtn && !submitResetBtn.dataset.bound) {
            submitResetBtn.dataset.bound = 'true';
            submitResetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDirectReset();
            });
        }

        (window as any).openPasswordResetModal = () => this.open();
        (window as any).closePasswordResetModal = () => this.close();
    }

    static open() {
        this.init();
        if (!this.resetModal) {
            this.resetModal = document.getElementById('reset-password-modal');
        }
        if (!this.resetModal) return;

        if (this.directForm) this.directForm.reset();
        if (this.errorEl) this.errorEl.style.display = 'none';

        // Pre-fill with current user's email, roll number, or identifier
        let defaultId = '';
        try {
            const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
            defaultId = storedUser.email || storedUser.roll_number || storedUser.username || '';
        } catch { }

        if (!defaultId) {
            defaultId = localStorage.getItem('cicr_auth') || '';
        }
        if (!defaultId) {
            const currentLoginVal = (document.getElementById('login-username') as HTMLInputElement)?.value.trim();
            defaultId = currentLoginVal || '';
        }

        if (defaultId && this.identifierInput) {
            this.identifierInput.value = defaultId;
        }

        this.resetModal.style.display = 'flex';
        void this.resetModal.offsetWidth;
        this.resetModal.classList.add('active');
        lucide.createIcons();

        if (defaultId && this.currentPassInput) {
            setTimeout(() => this.currentPassInput?.focus(), 150);
        } else if (this.identifierInput) {
            setTimeout(() => this.identifierInput?.focus(), 150);
        }
    }

    static close() {
        if (!this.resetModal) {
            this.resetModal = document.getElementById('reset-password-modal');
        }
        if (this.resetModal) {
            this.resetModal.classList.remove('active');
            setTimeout(() => {
                if (this.resetModal && !this.resetModal.classList.contains('active')) {
                    this.resetModal.style.display = 'none';
                }
            }, 260);
        }
    }

    private static async handleDirectReset() {
        if (!this.identifierInput || !this.currentPassInput || !this.newPassInput || !this.confirmPassInput) return;
        const identifier = this.identifierInput.value.trim();
        let currentPassword = this.currentPassInput.value;
        let newPassword = this.newPassInput.value;
        const confirmPassword = this.confirmPassInput.value;
        if (this.errorEl) this.errorEl.style.display = 'none';

        if (!identifier) {
            this.showError('Please enter your college email or enrollment number.');
            return;
        }

        if (!currentPassword) {
            this.showError('Please enter your current password to verify your identity.');
            return;
        }

        if (newPassword.length < 6) {
            this.showError('New password must be at least 6 characters.');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showError('New passwords do not match. Please verify and re-type.');
            return;
        }

        if (newPassword === currentPassword) {
            this.showError('New password cannot be the same as your current password.');
            return;
        }

        const submitBtn = document.getElementById('btn-submit-reset-direct') as HTMLButtonElement | null;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Verifying Credentials...`;
            lucide.createIcons();
        }

        try {
            const res = await fetch(`${API_BASE}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier,
                    current_password: currentPassword,
                    new_password: newPassword
                })
            });

            const data = await res.json();

            if (!res.ok) {
                this.showError(data.message || 'Password update failed. Please check your credentials.');
                return;
            }

            // Successfully updated password in database!
            ToastManager.show(
                'Password Updated & Synced',
                'Your account credentials have been securely verified and updated in the database.',
                'success'
            );

            this.close();

            const isCurrentlyLoggedIn = Boolean(localStorage.getItem('cicr_token') || localStorage.getItem('cicr_auth'));
            if (!isCurrentlyLoggedIn) {
                // Pre-populate login form with email and switch to login view
                const loginUser = document.getElementById('login-username') as HTMLInputElement | null;
                if (loginUser) loginUser.value = identifier;
                const loginPass = document.getElementById('login-password') as HTMLInputElement | null;
                if (loginPass) {
                    loginPass.value = '';
                    loginPass.focus();
                }
                newPassword = '';

                document.getElementById('go-to-login')?.click();
            }
            DatabaseManager.addLog('system', `Password successfully updated in vault database for ${identifier}.`);
        } catch (err) {
            this.showError('Network error. Unable to contact authentication server.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="shield-check"></i> Authenticate & Update Password`;
                lucide.createIcons();
            }
        }
    }

    private static showError(msg: string) {
        if (!this.errorEl) {
            this.errorEl = document.getElementById('reset-error');
        }
        if (this.errorEl) {
            this.errorEl.innerText = msg;
            this.errorEl.style.display = 'block';
            this.errorEl.style.animation = 'none';
            this.errorEl.offsetHeight;
            this.errorEl.style.animation = 'shake-error 0.4s ease';
        }
    }
}

// ==========================================
// Admin Member Management & Approval System
// ==========================================
export function getStudentBranch(rollVal?: string | null, explicitBranch?: string | null): string {
    if (explicitBranch && explicitBranch.trim() && !explicitBranch.includes('NaN')) {
        const cleanExp = explicitBranch.trim().toUpperCase();
        if (cleanExp !== 'JIIT MEMBER' && cleanExp !== 'ACTIVE' && cleanExp !== 'BATCH: ACTIVE') {
            return cleanExp;
        }
    }
    const clean = (rollVal || '').trim();
    if (!clean) return 'CSE';
    if (clean.includes('103') || clean.includes('0103')) return 'CSE';
    if (clean.includes('102') || clean.includes('0102')) return 'IT';
    if (clean.includes('121') || clean.includes('0121')) return 'ECE';
    if (clean.includes('114') || clean.includes('0114')) return 'BT';
    if (clean.includes('101') || clean.includes('0101')) return 'CSE';
    return 'CSE';
}

interface AdminUserRecord {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    batch?: string | null;
    branch?: string | null;
    roll_number: string | null;
    role: 'ADMIN' | 'MEMBER';
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
    isMasterAdmin?: boolean;
    created_at: string;
}

interface AdminHardwareRequest {
    id: string;
    type?: 'ISSUE' | 'RETURN';
    borrowId?: string;
    returnQuantity?: number;
    itemId: string;
    itemName: string;
    category?: string;
    borrowerName: string;
    borrowerEmail: string;
    rollNumber?: string | null;
    quantity: number;
    originalQuantity?: number;
    queuePosition?: number;
    queueAvailable?: number;
    queueAllocated?: number;
    purpose: string;
    durationDays: number;
    dueDate: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    reviewNote?: string;
}

class AdminManager {
    public static users: AdminUserRecord[] = [];
    public static hardwareRequests: AdminHardwareRequest[] = [];
    public static userHardwareRequests: AdminHardwareRequest[] = [];
    public static auditLogs: any[] = [];
    private static activeAuditCategory = 'all';
    private static auditSearchTerm = '';
    private static activeUserRoleFilter = 'all';
    private static isInitialized = false;
    private static lastHardwareQueueFingerprint = '';
    private static lastPendingQueueFingerprint = '';
    private static lastUsersTableFingerprint = '';

    static init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        const refreshBtn = document.getElementById('admin-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const icon = refreshBtn.querySelector('i');
                if (icon) icon.classList.add('animate-spin');
                refreshBtn.setAttribute('disabled', 'true');
                try {
                    await this.loadUsers(true);
                    ToastManager.show('Directory Refreshed', 'User accounts and roles updated.', 'info');
                } finally {
                    if (icon) icon.classList.remove('animate-spin');
                    refreshBtn.removeAttribute('disabled');
                }
            });
        }

        const hwRefreshBtn = document.getElementById('admin-hw-refresh-btn');
        if (hwRefreshBtn) {
            hwRefreshBtn.addEventListener('click', async () => {
                const icon = hwRefreshBtn.querySelector('i');
                if (icon) icon.classList.add('animate-spin');
                hwRefreshBtn.setAttribute('disabled', 'true');
                try {
                    await this.loadHardwareRequests(true);
                    ToastManager.show('Queue Refreshed', 'Hardware issue requests updated.', 'info');
                } finally {
                    if (icon) icon.classList.remove('animate-spin');
                    hwRefreshBtn.removeAttribute('disabled');
                }
            });
        }

        const rolePills = document.getElementById('admin-users-role-pills');
        if (rolePills) {
            rolePills.querySelectorAll<HTMLButtonElement>('.audit-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const filter = pill.getAttribute('data-user-filter') || 'all';
                    this.activeUserRoleFilter = filter;
                    rolePills.querySelectorAll('.audit-pill').forEach(p => p.classList.toggle('active', p === pill));
                    const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
                    this.renderUsersTable(this.filterUsers(searchInput ? searchInput.value : ''));
                });
            });
        }

        const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderUsersTable(this.filterUsers(searchInput.value));
            });
        }

        const auditRefreshBtn = document.getElementById('admin-audit-refresh-btn');
        if (auditRefreshBtn) {
            auditRefreshBtn.addEventListener('click', async () => {
                const icon = auditRefreshBtn.querySelector('i');
                if (icon) icon.classList.add('animate-spin');
                auditRefreshBtn.setAttribute('disabled', 'true');
                try {
                    await this.loadAuditLogs();
                    ToastManager.show('Audit Refreshed', '7-Day system audit logs updated.', 'info');
                } finally {
                    if (icon) icon.classList.remove('animate-spin');
                    auditRefreshBtn.removeAttribute('disabled');
                }
            });
        }

        const show7DaysBtn = document.getElementById('admin-audit-show-7days-btn');
        if (show7DaysBtn) {
            show7DaysBtn.addEventListener('click', async () => {
                const icon = show7DaysBtn.querySelector('i');
                if (icon) icon.classList.add('animate-spin');
                show7DaysBtn.setAttribute('disabled', 'true');
                try {
                    await this.loadAuditLogs(true);
                    ToastManager.show('7-Day History Loaded', `Displaying complete 7-day activity ledger (${this.auditLogs.length} events).`, 'success');
                } finally {
                    if (icon) icon.classList.remove('animate-spin');
                    show7DaysBtn.removeAttribute('disabled');
                }
            });
        }

        const footerAllBtn = document.getElementById('admin-audit-footer-all-btn');
        if (footerAllBtn) {
            footerAllBtn.addEventListener('click', async () => {
                await this.loadAuditLogs(true);
                ToastManager.show('7-Day History Loaded', `Displaying all ${this.auditLogs.length} records across 7 days.`, 'success');
            });
        }

        const rangePills = document.querySelectorAll('#admin-audit-range-pills .audit-range-pill');
        rangePills.forEach(pill => {
            pill.addEventListener('click', async () => {
                rangePills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.activeAuditDaysRange = Number(pill.getAttribute('data-range-days') || '7');
                this.activeAuditDay = 'all';
                // Immediate client-side re-render for instantaneous tactile responsiveness
                this.renderAuditLogs();
                await this.loadAuditLogs();
            });
        });

        const auditExportBtn = document.getElementById('admin-audit-export-btn');
        if (auditExportBtn) {
            auditExportBtn.addEventListener('click', () => {
                this.exportAuditLogsCSV();
            });
        }

        const auditCleanupBtn = document.getElementById('admin-audit-cleanup-btn');
        if (auditCleanupBtn) {
            auditCleanupBtn.addEventListener('click', async () => {
                await this.triggerAuditRetentionCleanup();
            });
        }

        const auditSearch = document.getElementById('admin-audit-search') as HTMLInputElement;
        const auditSearchClear = document.getElementById('admin-audit-search-clear');
        if (auditSearch) {
            auditSearch.addEventListener('input', () => {
                this.auditSearchTerm = auditSearch.value.trim().toLowerCase();
                if (auditSearchClear) {
                    auditSearchClear.style.display = this.auditSearchTerm ? 'inline-flex' : 'none';
                }
                this.renderAuditLogs();
            });
        }
        if (auditSearchClear && auditSearch) {
            auditSearchClear.addEventListener('click', () => {
                auditSearch.value = '';
                this.auditSearchTerm = '';
                auditSearchClear.style.display = 'none';
                this.renderAuditLogs();
            });
        }

        const auditPills = document.querySelectorAll('#admin-audit-pills .audit-pill');
        auditPills.forEach(pill => {
            pill.addEventListener('click', () => {
                auditPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.activeAuditCategory = (pill as HTMLElement).dataset.auditCat || 'all';
                this.loadAuditLogs();
            });
        });

        // Wire Audit Detail modal close & copy JSON
        const closeAuditModal = document.getElementById('close-audit-detail');
        const auditModal = document.getElementById('audit-detail-modal');
        if (closeAuditModal && auditModal) {
            closeAuditModal.addEventListener('click', () => {
                auditModal.classList.remove('active');
            });
            auditModal.addEventListener('click', (e) => {
                if (e.target === auditModal) auditModal.classList.remove('active');
            });
        }
        const copyJsonBtn = document.getElementById('audit-copy-json-btn');
        if (copyJsonBtn) {
            copyJsonBtn.addEventListener('click', () => {
                const pre = document.getElementById('audit-modal-json');
                if (pre && pre.innerText) {
                    navigator.clipboard.writeText(pre.innerText).then(() => {
                        ToastManager.show('Copied', 'Raw telemetry event JSON copied to clipboard.', 'success');
                    }).catch(() => {});
                }
            });
        }

        // Wire User Profile Inspector for clickable user items in Admin Portal & Ledger
        document.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.admin-user-clickable') as HTMLElement | null;
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                AdminManager.inspectUserProfile({
                    id: target.dataset.userId,
                    name: target.dataset.userName,
                    email: target.dataset.userEmail,
                    roll: target.dataset.userRoll,
                    batch: target.dataset.userBatch
                });
            }
        });

        // Secure event delegation for admin actions (prevents global window exposure and inline script execution)
        const pendingContainer = document.getElementById('admin-pending-list');
        if (pendingContainer && !pendingContainer.dataset.boundDelegation) {
            pendingContainer.dataset.boundDelegation = 'true';
            pendingContainer.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const approveBtn = target.closest<HTMLElement>('[data-action="approve"]');
                if (approveBtn) {
                    e.stopPropagation();
                    const id = approveBtn.dataset.userId;
                    if (id) this.approveUser(id);
                    return;
                }
                const rejectBtn = target.closest<HTMLElement>('[data-action="reject"]');
                if (rejectBtn) {
                    e.stopPropagation();
                    const id = rejectBtn.dataset.userId;
                    if (id) this.rejectUser(id);
                    return;
                }
            });
        }

        const usersTbody = document.getElementById('admin-users-tbody');
        if (usersTbody && !usersTbody.dataset.boundDelegation) {
            usersTbody.dataset.boundDelegation = 'true';
            usersTbody.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const setRoleBtn = target.closest<HTMLElement>('[data-action="set-role"]');
                if (setRoleBtn) {
                    e.stopPropagation();
                    const id = setRoleBtn.dataset.userId;
                    const role = setRoleBtn.dataset.role as 'ADMIN' | 'MEMBER';
                    if (id && role) this.setRole(id, role);
                    return;
                }
                const delBtn = target.closest<HTMLElement>('[data-action="delete"]');
                if (delBtn) {
                    e.stopPropagation();
                    const id = delBtn.dataset.userId;
                    const name = delBtn.dataset.userName || '';
                    if (id) this.deleteUser(id, name);
                    return;
                }
            });
        }

        const hwList = document.getElementById('admin-hardware-list');
        if (hwList && !hwList.dataset.boundDelegation) {
            hwList.dataset.boundDelegation = 'true';
            hwList.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const approveBtn = target.closest<HTMLElement>('[data-action="hw-approve"]');
                if (approveBtn) {
                    e.stopPropagation();
                    const id = approveBtn.dataset.requestId;
                    if (id) this.approveHardware(id);
                    return;
                }
                const rejectBtn = target.closest<HTMLElement>('[data-action="hw-reject"]');
                if (rejectBtn) {
                    e.stopPropagation();
                    const id = rejectBtn.dataset.requestId;
                    if (id) this.rejectHardware(id);
                    return;
                }
            });
        }

        const auditList = document.getElementById('admin-audit-stream') || document.getElementById('admin-audit-list');
        if (auditList && !auditList.dataset.boundDelegation) {
            auditList.dataset.boundDelegation = 'true';
            auditList.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const card = target.closest<HTMLElement>('[data-log-id]');
                if (card && card.dataset.logId) {
                    this.openAuditDetail(card.dataset.logId);
                }
            });
        }

        (window as any).openBulkReturnModal = () => ModalManager.openBulkReturnModal();
        (window as any).inspectUserProfile = (info: any) => AdminManager.inspectUserProfile(info);
    }

    static async loadUsers(force = false) {
        const token = localStorage.getItem('cicr_token');
        const isAuth = document.body.classList.contains('authenticated') || document.documentElement.classList.contains('is-authenticated');

        if (token && isAuth) {
            try {
                const res = await fetch(`${API_BASE}/auth/admin/users${force ? '?force=true' : ''}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const result = await res.json();
                    if (Array.isArray(result.data)) {
                        this.users = result.data.filter((u: any) => {
                            const email = (u?.email || '').toLowerCase().trim();
                            const name = (u?.name || '').toLowerCase().trim();
                            if (email.endsWith('.test') || email.includes('cicr.test')) return false;
                            if (name === 'test user' || name === 'test admin' || name === 'admin user' || name === 'test student') return false;
                            return true;
                        });
                    }
                } else if (res.status === 401 || res.status === 403) {
                    console.warn('[AdminManager] Admin users access restricted.');
                    return;
                }
            } catch (err) {
                console.error('Failed to fetch admin users:', err);
            }
        }


        this.updateStats();
        this.renderPendingQueue(force);

        const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
        const query = searchInput ? searchInput.value : '';
        this.renderUsersTable(this.filterUsers(query), force);
    }

    static getHandledRequestIds(): Set<string> {
        try {
            const raw = localStorage.getItem('cicr_dismissed_requests');
            return new Set<string>(raw ? JSON.parse(raw) : []);
        } catch {
            return new Set<string>();
        }
    }

    static getRequestCanonicalKey(r: any): string {
        if (!r) return '';
        const isReturn = r.type === 'RETURN' || Boolean(r.borrowId);
        if (isReturn) {
            const bId = (r.borrowId || r.id || '').toString().trim().toLowerCase();
            return `ret__${bId}`;
        }
        const email = (r.borrowerEmail || r.email || '').toString().toLowerCase().trim();
        const name = (r.borrowerName || r.name || '').toString().toLowerCase().trim();
        const roll = (r.rollNumber || r.roll || '').toString().toLowerCase().trim();
        const item = (r.itemId || r.itemName || '').toString().toLowerCase().trim();
        const qty = Number(r.quantity || r.qty) || 1;
        const purpose = (r.purpose || '').toString().toLowerCase().trim();
        const borrower = roll || email || name;
        return `iss__${borrower}__${item}__${qty}__${purpose}`;
    }

    static markRequestHandled(...ids: (string | undefined | null)[]) {
        try {
            const raw = localStorage.getItem('cicr_dismissed_requests');
            const list: string[] = raw ? JSON.parse(raw) : [];
            let changed = false;
            for (const id of ids) {
                if (id && typeof id === 'string' && !list.includes(id)) {
                    list.push(id);
                    changed = true;
                }
            }
            if (changed) {
                if (list.length > 300) list.splice(0, list.length - 300);
                localStorage.setItem('cicr_dismissed_requests', JSON.stringify(list));
            }
        } catch { }
    }

    static async loadHardwareRequests(force = false) {
        const token = localStorage.getItem('cicr_token');
        const isAuth = document.body.classList.contains('authenticated') || document.documentElement.classList.contains('is-authenticated');
        if (!token || !isAuth) return;

        const handledIds = this.getHandledRequestIds();
        let serverList: AdminHardwareRequest[] = [];

        // 1. Fetch from hardware requests endpoint (backend merges local requests & Supabase pending records)
        try {
            const res = await fetch(`${API_BASE}/borrow/requests${force ? '?force=true' : ''}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const result = await res.json();
                serverList = result.data || [];
            } else if (res.status === 401 || res.status === 403) {
                console.warn('[AdminManager] Hardware requests access restricted.');
                return;
            }
        } catch (err) {
            console.error('Failed to fetch hardware requests:', err);
        }

        const isTestItem = (r: any): boolean => {
            const em = (r?.email || r?.borrowerEmail || '').toLowerCase().trim();
            const nm = (r?.name || r?.borrowerName || '').toLowerCase().trim();
            if (em.includes('.test') || em.includes('cicr.test') || em === 'member@cicr.test') return true;
            if (nm === 'stu' || nm === 'test member' || nm === 'test user') return true;
            return false;
        };

        serverList = serverList.filter(item => !isTestItem(item));

        // 2. Collect from local requests state and localStorage
        const localStoredRaw = localStorage.getItem('cicr_requests');
        let localRequests: RequestRecord[] = [];
        if (localStoredRaw) {
            try {
                localRequests = JSON.parse(localStoredRaw);
                const cleaned = localRequests.filter(r => !isTestItem(r));
                if (cleaned.length !== localRequests.length) {
                    localStorage.setItem('cicr_requests', JSON.stringify(cleaned));
                    localRequests = cleaned;
                }
            } catch { }
        }
        const combinedLocal = [...(requests || []).filter(r => !isTestItem(r)), ...localRequests];
        const localPending: AdminHardwareRequest[] = combinedLocal
            .filter((r) => r.status === 'PENDING')
            .map((r) => ({
                id: r.id,
                type: (r as any).type || ((r as any).borrowId ? 'RETURN' : 'ISSUE'),
                borrowId: (r as any).borrowId,
                returnQuantity: (r as any).returnQuantity,
                itemId: r.itemId,
                itemName: r.itemName,
                borrowerName: r.name,
                borrowerEmail: (r as any).email || (r as any).borrowerEmail || (r.roll ? `${r.roll}@mail.jiit.ac.in` : ''),
                rollNumber: r.roll || null,
                quantity: Number(r.qty) || 1,
                purpose: r.purpose || 'Testing',
                durationDays: 7,
                dueDate: r.dueDate || '7 Days',
                status: 'PENDING' as const,
                requestedAt: r.requestedAt || new Date().toISOString()
            }));

        const isItemDismissed = (item: any): boolean => {
            if (!item) return true;
            if (item.status !== 'PENDING') return false;
            if (handledIds.has(item.id)) return true;
            if (item.borrowId && handledIds.has(item.borrowId)) return true;
            const key = this.getRequestCanonicalKey(item);
            if (key && handledIds.has(key)) return true;
            return false;
        };

        const role = ModalManager.getCurrentRole();
        const isAdmin = role === 'ADMIN';

        if (!isAdmin) {
            // Member: Store all returned requests across all statuses (PENDING, APPROVED, REJECTED)
            this.userHardwareRequests = serverList.slice().sort((a, b) => {
                return new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime();
            });
            // Also keep local pending submissions if any (only belonging to current user)
            for (const lp of localPending.filter(r => ModalManager.isUserRequestMatch(r))) {
                if (!this.userHardwareRequests.some(r => r.id === lp.id || (r.borrowId && r.borrowId === lp.borrowId))) {
                    this.userHardwareRequests.unshift(lp);
                }
            }
            this.hardwareRequests = this.userHardwareRequests;
        } else {
            const canonicalQueue = new Map<string, AdminHardwareRequest>();

            // 1. Process server list first (canonical source of truth for admin)
            for (const item of serverList) {
                if (!item) continue;
                if (item.status === 'PENDING' && isItemDismissed(item)) continue;
                const key = `${this.getRequestCanonicalKey(item) || item.id}__${item.status || 'PENDING'}`;
                if (!canonicalQueue.has(key)) {
                    canonicalQueue.set(key, item);
                }
            }

            // 2. Add localPending items ONLY if server request failed OR item is a recent in-flight submission (< 60s)
            const now = Date.now();
            for (const item of localPending) {
                if (!item) continue;
                if (item.status === 'PENDING' && isItemDismissed(item)) continue;
                const isRecent = item.requestedAt ? (now - new Date(item.requestedAt).getTime() < 60000) : false;
                if (!isRecent && serverList.length >= 0) continue;
                const key = `${this.getRequestCanonicalKey(item) || item.id}__${item.status || 'PENDING'}`;
                if (!canonicalQueue.has(key)) {
                    canonicalQueue.set(key, item);
                }
            }

            this.hardwareRequests = Array.from(canonicalQueue.values()).sort((a, b) => {
                return new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime();
            });
        }
        this.updateStats();
        this.renderHardwareQueue(force);
        DatabaseManager.updateNotificationBadges();
    }

    private static updateStats() {
        const pendingUsers = this.users.filter(u => u.status === 'PENDING').length;
        const pendingHardware = this.hardwareRequests.filter(r => r.status === 'PENDING').length;
        const approved = this.users.filter(u => u.status === 'APPROVED').length;
        const admins = this.users.filter(u => u.role === 'ADMIN').length;

        const statPendingUsers = document.getElementById('admin-stat-pending');
        const statPendingHw = document.getElementById('admin-stat-hw-pending');
        const statApproved = document.getElementById('admin-stat-approved');
        const statAdmins = document.getElementById('admin-stat-admins');
        const pendingTag = document.getElementById('admin-pending-count-tag');
        const hwTag = document.getElementById('admin-hw-count-tag');
        const sidebarBadge = document.getElementById('admin-pending-badge');

        const pUserStr = pendingUsers.toString();
        const pHwStr = pendingHardware.toString();
        const appStr = approved.toString();
        const admStr = admins.toString();
        const pTagStr = `${pendingUsers} PENDING`;
        const hwTagStr = `${pendingHardware} PENDING`;

        if (statPendingUsers && statPendingUsers.innerText !== pUserStr) statPendingUsers.innerText = pUserStr;
        if (statPendingHw && statPendingHw.innerText !== pHwStr) statPendingHw.innerText = pHwStr;
        if (statApproved && statApproved.innerText !== appStr) statApproved.innerText = appStr;
        if (statAdmins && statAdmins.innerText !== admStr) statAdmins.innerText = admStr;
        if (pendingTag && pendingTag.innerText !== pTagStr) pendingTag.innerText = pTagStr;
        if (hwTag && hwTag.innerText !== hwTagStr) hwTag.innerText = hwTagStr;

        const totalPending = pendingUsers + pendingHardware;
        if (sidebarBadge) {
            if (totalPending > 0) {
                if (sidebarBadge.style.display !== 'inline-block') sidebarBadge.style.display = 'inline-block';
                if (sidebarBadge.innerText !== totalPending.toString()) sidebarBadge.innerText = totalPending.toString();
            } else {
                if (sidebarBadge.style.display !== 'none') sidebarBadge.style.display = 'none';
            }
        }
    }

    private static renderHardwareQueue(force = false) {
        const container = document.getElementById('admin-hardware-list');
        if (!container) return;

        const pendingRequests = this.hardwareRequests
            .filter(r => r.status === 'PENDING')
            .sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
        const fingerprint = pendingRequests.map(r => `${r.id}_${r.status}_${r.quantity}_${r.returnQuantity || ''}_${r.borrowerEmail}_${r.itemName}_${r.type || ''}`).join('|');

        if (!force && this.lastHardwareQueueFingerprint === fingerprint && container.children.length === (pendingRequests.length === 0 ? 1 : pendingRequests.length)) {
            return;
        }
        this.lastHardwareQueueFingerprint = fingerprint;

        if (pendingRequests.length === 0) {
            container.innerHTML = `
                <div class="admin-empty-state">
                    <i data-lucide="package-check"></i>
                    <p>No pending component requests in queue. Vault operations nominal.</p>
                </div>
            `;
            renderLucideIcons(container);
            return;
        }

        container.innerHTML = pendingRequests.map(r => {
            const isReturn = r.type === 'RETURN';
            const returnQty = Number(r.returnQuantity || r.quantity) || 1;
            const origQty = Number(r.originalQuantity) || 0;
            const isQueueAdjusted = !isReturn && origQty > 0 && origQty > r.quantity;
            return `
            <div class="hardware-request-card glass" data-request-id="${escapeHtml(r.id)}">
                <div class="hw-card-header">
                    <div class="hw-card-chip">
                        <i data-lucide="${isReturn ? 'corner-up-left' : 'cpu'}" style="width:14px; height:14px; color:var(--neon-cyan);"></i>
                        <span class="hw-item-name">${escapeHtml(r.itemName)}</span>
                        ${r.queuePosition ? `<span class="hw-queue-pos" style="font-size:10px; background:rgba(99,102,241,0.18); border:1px solid rgba(99,102,241,0.35); color:#a5b4fc; border-radius:4px; padding:1px 6px; margin-left:6px;"><i data-lucide="layers" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i> Queue #${r.queuePosition}</span>` : ''}
                    </div>
                    <span class="hw-qty-badge" style="${isQueueAdjusted ? 'background:rgba(245,158,11,0.2); border-color:rgba(245,158,11,0.45); color:#fbbf24;' : ''}">
                        ${isReturn ? 'RETURN' : 'ISSUE'} · ${isReturn ? returnQty : r.quantity}x
                        ${isQueueAdjusted ? ` (of ${origQty}x)` : ''}
                    </span>
                </div>

                <div class="hw-card-requester">
                    <div class="hw-avatar admin-user-clickable" data-user-name="${this.escapeHtml(r.borrowerName)}" data-user-email="${this.escapeHtml(r.borrowerEmail)}" data-user-roll="${this.escapeHtml(r.rollNumber || '')}" title="Inspect Member Profile">${r.borrowerName ? escapeHtml(r.borrowerName.charAt(0).toUpperCase()) : 'U'}</div>
                    <div class="hw-meta-col">
                        <span class="hw-requester-name admin-user-clickable" data-user-name="${this.escapeHtml(r.borrowerName)}" data-user-email="${this.escapeHtml(r.borrowerEmail)}" data-user-roll="${this.escapeHtml(r.rollNumber || '')}" title="Inspect Member Profile">${escapeHtml(r.borrowerName)}</span>
                        <span class="hw-requester-email">${escapeHtml(r.borrowerEmail)}</span>
                    </div>
                </div>

                <div class="hw-card-details">
                    ${r.rollNumber ? `<div class="hw-detail-row"><span class="hw-lbl">ROLL:</span> <span class="hw-val mono">${escapeHtml(r.rollNumber)}</span></div>` : ''}
                    ${isReturn
                    ? `<div class="hw-detail-row"><span class="hw-lbl">RETURNING:</span> <span class="hw-val">${returnQty}x ${escapeHtml(r.itemName)}</span></div>`
                    : `<div class="hw-detail-row"><span class="hw-lbl">PURPOSE:</span> <span class="hw-val">${escapeHtml(r.purpose)}</span></div>`}
                    ${isQueueAdjusted ? `<div class="hw-detail-row"><span class="hw-lbl">QUEUE MATH:</span> <span class="hw-val" style="color:#fbbf24; font-weight:700;">Auto-Allocated ${r.quantity} of ${origQty} units (Remaining stock: ${r.queueAvailable !== undefined ? r.queueAvailable : r.quantity})</span></div>` : ''}
                    ${isReturn ? '' : `<div class="hw-detail-row"><span class="hw-lbl">DUE DATE:</span> <span class="hw-val due">${escapeHtml(r.dueDate || '7 Days')}</span></div>`}
                    <div class="hw-detail-row"><span class="hw-lbl">REQUESTED:</span> <span class="hw-val date">${new Date(r.requestedAt).toLocaleString()}</span></div>
                </div>

                <div class="hw-card-actions">
                    <button class="btn-hw-approve" data-action="hw-approve" data-request-id="${escapeHtml(r.id)}">
                        <i data-lucide="check"></i> ${isReturn ? 'Approve Return' : 'Approve Issue'}
                    </button>
                    <button class="btn-hw-reject" data-action="hw-reject" data-request-id="${escapeHtml(r.id)}">
                        <i data-lucide="x"></i> Reject
                    </button>
                </div>
            </div>
            `;
        }).join('');

        renderLucideIcons(container);
    }

    private static pendingActionIds = new Set<string>();

    static async approveHardware(id: string) {
        if (this.pendingActionIds.has(id)) return;
        this.pendingActionIds.add(id);
        setTimeout(() => this.pendingActionIds.delete(id), 2500);

        const token = localStorage.getItem('cicr_token');
        const targetReq = this.hardwareRequests.find(r => r.id === id)
            || (requests.find(r => r.id === id) as any);
        const reqSnapshot = targetReq ? { ...targetReq } : null;
        const targetKey = this.getRequestCanonicalKey(targetReq);

        const isReturnReq = reqSnapshot?.type === 'RETURN' || Boolean(reqSnapshot?.borrowId);

        // Queue math stock auto-cap: if stock is depleted by earlier approved requests
        if (reqSnapshot && !isReturnReq) {
            const targetItem = inventory.find(i => String(i.id) === String(reqSnapshot.itemId));
            if (targetItem) {
                const avail = typeof targetItem.availableQuantity === 'number' ? targetItem.availableQuantity : targetItem.quantity;
                if (avail < reqSnapshot.quantity && avail > 0) {
                    reqSnapshot.quantity = avail;
                    ToastManager.show('Queue Auto-Adjusted', `Stock is limited to ${avail}. Authorizing ${avail}x ${targetReq.itemName}.`, 'info');
                }
            }
        }

        // Strict Order Check: If approving a RETURN, ensure there is NO pending ISSUE request for this item & borrower
        if (isReturnReq) {
            const hasPendingIssue = this.hardwareRequests.some(r => {
                if (r.id === id || r.status !== 'PENDING' || r.type === 'RETURN' || Boolean(r.borrowId)) return false;
                const sameItem = r.itemId === reqSnapshot?.itemId;
                const sameEmail = Boolean(r.borrowerEmail && reqSnapshot?.borrowerEmail && r.borrowerEmail.toLowerCase().trim() === reqSnapshot.borrowerEmail.toLowerCase().trim());
                const sameName = Boolean(r.borrowerName && reqSnapshot?.borrowerName && r.borrowerName.toLowerCase().trim() === reqSnapshot.borrowerName.toLowerCase().trim());
                return sameItem && (sameEmail || sameName);
            });
            if (hasPendingIssue) {
                ToastManager.show('Order Violation Blocked', 'Cannot approve return before the component issue request is approved first.', 'warning');
                this.pendingActionIds.delete(id);
                return;
            }
        }

        const matchesTarget = (r: any): boolean => {
            if (!r) return false;
            if (r.id === id) return true;
            if (targetReq?.id && r.id === targetReq.id) return true;
            if (targetReq?.borrowId && (r.borrowId === targetReq.borrowId || r.id === targetReq.borrowId)) return true;
            if (r.borrowId && (r.borrowId === id || r.id === id)) return true;
            if (targetKey) {
                const k = AdminManager.getRequestCanonicalKey(r);
                if (k && k === targetKey) return true;
            }
            return false;
        };

        const currentAdminName = (() => {
            try {
                const u = JSON.parse(localStorage.getItem('cicr_user') || '{}');
                return u.name || u.username || 'Lab Administrator';
            } catch { return 'Lab Administrator'; }
        })();

        // Permanently record as handled so it NEVER resurrects in UI
        this.markRequestHandled(id, targetReq?.id, targetReq?.borrowId, targetKey);

        // 1. INSTANT 1-CLICK OPTIMISTIC UI UPDATE (Zero Latency)
        this.hardwareRequests.forEach(r => {
            if (matchesTarget(r)) {
                r.status = 'APPROVED';
                r.reviewedBy = currentAdminName;
                r.reviewedAt = new Date().toISOString();
            }
        });
        requests.forEach(r => {
            if (matchesTarget(r)) {
                r.status = 'APPROVED';
            }
        });
        if (Array.isArray(this.userHardwareRequests)) {
            this.userHardwareRequests.forEach(r => {
                if (matchesTarget(r)) {
                    r.status = 'APPROVED';
                    r.reviewedBy = currentAdminName;
                    r.reviewedAt = new Date().toISOString();
                }
            });
        }
        this.updateStats();
        this.renderHardwareQueue(true);

        // Immediately purge from localStorage
        const localStoredRaw = localStorage.getItem('cicr_requests');
        if (localStoredRaw) {
            try {
                const parsed = JSON.parse(localStoredRaw);
                const filtered = parsed.filter((r: any) => !matchesTarget(r));
                localStorage.setItem('cicr_requests', JSON.stringify(filtered));
            } catch { }
        }

        if (reqSnapshot) {
            const targetItem = inventory.find(i => String(i.id) === String(reqSnapshot.itemId));
            if (targetItem) {
                if (!targetItem.borrowedBy) targetItem.borrowedBy = [];
                if (isReturnReq) {
                    const bRec = targetItem.borrowedBy.find((b: any) =>
                        (reqSnapshot.borrowId && (b.id === reqSnapshot.borrowId || b._id === reqSnapshot.borrowId)) ||
                        (!b.returned && (b.userName === reqSnapshot.borrowerName || b.name === reqSnapshot.borrowerName || b.email === reqSnapshot.borrowerEmail))
                    );
                    if (bRec) {
                        bRec.returned = true;
                        bRec.status = 'RETURNED';
                        bRec.returnDate = new Date().toISOString();
                        bRec.adminApprovedBy = `${currentAdminName} (Admin)`;
                        bRec.approvedBy = currentAdminName;
                    }
                } else {
                    targetItem.borrowedBy.push({
                        id: reqSnapshot.id || `borrow-${Date.now()}`,
                        name: reqSnapshot.borrowerName,
                        userName: reqSnapshot.borrowerName,
                        borrowerName: reqSnapshot.borrowerName,
                        roll: reqSnapshot.rollNumber,
                        userRoll: reqSnapshot.rollNumber,
                        email: reqSnapshot.borrowerEmail,
                        userEmail: reqSnapshot.borrowerEmail,
                        qty: reqSnapshot.quantity,
                        purpose: reqSnapshot.purpose,
                        date: new Date().toISOString(),
                        dueDate: reqSnapshot.dueDate || null,
                        adminApprovedBy: `${currentAdminName} (Admin)`,
                        approvedBy: currentAdminName,
                        reviewedBy: currentAdminName,
                        status: 'BORROWED'
                    });
                }
            }
        }

        DatabaseManager.save();
        DatabaseManager.updateNotificationBadges();
        if (typeof ModalManager !== 'undefined' && typeof ModalManager.renderLogsDrawer === 'function') {
            ModalManager.renderLogsDrawer();
        }
        if (typeof NotificationCenterManager !== 'undefined' && typeof NotificationCenterManager.updateNotifications === 'function') {
            NotificationCenterManager.updateNotifications();
        }

        ToastManager.show(
            isReturnReq ? 'Return Authorized' : 'Request Authorized',
            `${isReturnReq ? 'Return' : 'Component issue'} for "${reqSnapshot?.itemName || 'Hardware'}" approved.`,
            'success'
        );
        DatabaseManager.addLog('approve', `Admin ${currentAdminName} authorized ${isReturnReq ? 'return' : 'hardware issue'} for "${reqSnapshot?.itemName || 'Hardware'}"`);

        // 2. Perform background sync to server
        try {
            const approvalPayload = {
                ...(reqSnapshot || {}),
                adminName: currentAdminName,
                admin_name: currentAdminName,
                admin_approved_by: currentAdminName,
                reviewedBy: currentAdminName
            };
            const res = await fetch(`${API_BASE}/borrow/requests/${id}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(approvalPayload)
            });

            if (!res.ok) {
                // If backend couldn't decrement stock (e.g. unlisted/mock item), tell backend to mark/clear the request
                await fetch(`${API_BASE}/borrow/requests/${id}/reject`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ reason: 'Approved offline / unlisted inventory item.', adminName: currentAdminName })
                }).catch(() => { });
            }
        } catch (e) {
            console.warn('Background approval sync note:', e);
        }

        // Non-blocking telemetry refresh in background
        this.loadAuditLogs();
        DatabaseManager.syncFromBackend();
        if (typeof HardwareLedgerManager !== 'undefined') {
            HardwareLedgerManager.fetchLedger(true).then(() => HardwareLedgerManager.renderTable()).catch(() => {});
        }
    }

    static async rejectHardware(id: string) {
        if (this.pendingActionIds.has(id)) return;
        this.pendingActionIds.add(id);
        setTimeout(() => this.pendingActionIds.delete(id), 2500);

        const token = localStorage.getItem('cicr_token');
        const targetReq = this.hardwareRequests.find(r => r.id === id)
            || (requests.find(r => r.id === id) as any);
        const itemName = targetReq?.itemName || 'Component';
        const targetKey = this.getRequestCanonicalKey(targetReq);

        const matchesTarget = (r: any): boolean => {
            if (!r) return false;
            if (r.id === id) return true;
            if (targetReq?.id && r.id === targetReq.id) return true;
            if (targetReq?.borrowId && (r.borrowId === targetReq.borrowId || r.id === targetReq.borrowId)) return true;
            if (r.borrowId && (r.borrowId === id || r.id === id)) return true;
            if (targetKey) {
                const k = AdminManager.getRequestCanonicalKey(r);
                if (k && k === targetKey) return true;
            }
            return false;
        };

        const currentAdminName = (() => {
            try {
                const u = JSON.parse(localStorage.getItem('cicr_user') || '{}');
                return u.name || u.username || 'Lab Administrator';
            } catch { return 'Lab Administrator'; }
        })();

        // Permanently record as handled so it NEVER resurrects in UI
        this.markRequestHandled(id, targetReq?.id, targetReq?.borrowId, targetKey);

        // 1. INSTANT 1-CLICK OPTIMISTIC UI UPDATE (Zero Latency)
        this.hardwareRequests.forEach(r => {
            if (matchesTarget(r)) {
                r.status = 'REJECTED';
                r.reviewNote = 'Declined by Administrator.';
                r.reviewedBy = currentAdminName;
                r.reviewedAt = new Date().toISOString();
            }
        });
        requests.forEach(r => {
            if (matchesTarget(r)) {
                r.status = 'REJECTED';
                r.reviewNote = 'Declined by Administrator.';
            }
        });
        if (Array.isArray(this.userHardwareRequests)) {
            this.userHardwareRequests.forEach(r => {
                if (matchesTarget(r)) {
                    r.status = 'REJECTED';
                    r.reviewNote = 'Declined by Administrator.';
                    r.reviewedBy = currentAdminName;
                    r.reviewedAt = new Date().toISOString();
                }
            });
        }
        this.updateStats();
        this.renderHardwareQueue(true);

        // Immediately update localStorage
        const localStoredRaw = localStorage.getItem('cicr_requests');
        if (localStoredRaw) {
            try {
                const parsed = JSON.parse(localStoredRaw);
                const updated = parsed.map((r: any) => {
                    if (matchesTarget(r)) {
                        return { ...r, status: 'REJECTED', reviewNote: 'Declined by Administrator.' };
                    }
                    return r;
                });
                localStorage.setItem('cicr_requests', JSON.stringify(updated));
            } catch { }
        }
        DatabaseManager.save();
        DatabaseManager.updateNotificationBadges();
        if (typeof ModalManager !== 'undefined' && typeof ModalManager.renderLogsDrawer === 'function') {
            ModalManager.renderLogsDrawer();
        }
        if (typeof NotificationCenterManager !== 'undefined' && typeof NotificationCenterManager.updateNotifications === 'function') {
            NotificationCenterManager.updateNotifications();
        }

        ToastManager.show('Request Declined', `Hardware issue request for "${itemName}" declined.`, 'info');
        DatabaseManager.addLog('reject', `Admin ${currentAdminName} declined hardware issue request for "${itemName}"`);

        // 2. Perform background notification to server with full borrower details guaranteed
        const reqPayload = targetReq ? {
            ...targetReq,
            adminName: currentAdminName,
            reviewedBy: currentAdminName,
            reason: 'Declined by Administrator.',
            borrowerEmail: targetReq.borrowerEmail,
            borrowerName: targetReq.borrowerName,
            itemName: targetReq.itemName,
            quantity: targetReq.quantity,
            purpose: targetReq.purpose,
            type: targetReq.type,
            borrowId: targetReq.borrowId
        } : { adminName: currentAdminName, reviewedBy: currentAdminName, reason: 'Declined by Administrator.' };

        try {
            await fetch(`${API_BASE}/borrow/requests/${id}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(reqPayload)
            });
        } catch (e) {
            console.warn('Background rejection sync note:', e);
        }

        this.loadAuditLogs();
        DatabaseManager.syncFromBackend();
        if (typeof HardwareLedgerManager !== 'undefined') {
            HardwareLedgerManager.fetchLedger(true).then(() => HardwareLedgerManager.renderTable()).catch(() => {});
        }
    }

    private static renderPendingQueue(force = false) {
        const container = document.getElementById('admin-pending-list');
        if (!container) return;

        const pendingUsers = this.users.filter(u => u.status === 'PENDING');
        const fingerprint = pendingUsers.map(u => `${u.id}_${u.status}_${u.name}_${u.email}_${u.roll_number || ''}_${u.batch || ''}`).join('|');

        if (!force && this.lastPendingQueueFingerprint === fingerprint && container.children.length === (pendingUsers.length === 0 ? 1 : pendingUsers.length)) {
            return;
        }
        this.lastPendingQueueFingerprint = fingerprint;

        if (pendingUsers.length === 0) {
            container.innerHTML = `
                <div class="admin-empty-state">
                    <i data-lucide="check-circle-2"></i>
                    <p>No pending registration requests. All accounts are up to date!</p>
                </div>
            `;
            renderLucideIcons(container);
            return;
        }

        container.innerHTML = pendingUsers.map(u => {
            const dt = DashboardManager.formatLogDateTime(u.created_at);
            return `
            <div class="pending-request-card glass" data-user-id="${escapeHtml(u.id)}">
                <div class="pending-card-top">
                    <div class="pending-card-avatar admin-user-clickable" data-user-id="${escapeHtml(u.id)}" data-user-name="${this.escapeHtml(u.name)}" data-user-email="${this.escapeHtml(u.email)}" data-user-roll="${this.escapeHtml(u.roll_number || '')}" data-user-batch="${this.escapeHtml(u.batch || '')}" title="Inspect Profile">${u.name ? escapeHtml(u.name.charAt(0).toUpperCase()) : 'U'}</div>
                    <div class="pending-card-meta">
                        <span class="pending-card-name admin-user-clickable" data-user-id="${escapeHtml(u.id)}" data-user-name="${this.escapeHtml(u.name)}" data-user-email="${this.escapeHtml(u.email)}" data-user-roll="${this.escapeHtml(u.roll_number || '')}" data-user-batch="${this.escapeHtml(u.batch || '')}" title="Inspect Profile">${this.escapeHtml(u.name)}</span>
                        <span class="pending-card-email">${this.escapeHtml(u.email)}</span>
                    </div>
                </div>
                <div class="pending-card-extra">
                    <span><i data-lucide="calendar" style="width:11px; height:11px; vertical-align:middle;"></i> ${escapeHtml(dt.dateStr)}${dt.timeStr ? ` • ${escapeHtml(dt.timeStr)}` : ''}</span>
                    ${u.roll_number ? `<span>• Roll: ${this.escapeHtml(u.roll_number)}</span>` : ''}
                    <span>• Branch: ${this.escapeHtml(getStudentBranch(u.roll_number, u.batch))}</span>
                </div>
                <div class="pending-card-actions">
                    <button class="btn-approve" data-action="approve" data-user-id="${escapeHtml(u.id)}">
                        <i data-lucide="check"></i> Approve
                    </button>
                    <button class="btn-reject" data-action="reject" data-user-id="${escapeHtml(u.id)}">
                        <i data-lucide="x"></i> Reject
                    </button>
                </div>
            </div>
            `;
        }).join('');

        renderLucideIcons(container);
    }

    private static filterUsers(query: string) {
        if (!query || !query.trim()) return this.users;
        const q = query.toLowerCase().trim();
        return this.users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }

    private static renderUsersTable(usersList: AdminUserRecord[], force = false) {
        const tbody = document.getElementById('admin-users-tbody');
        if (!tbody) return;

        const totalBadge = document.getElementById('admin-users-total-badge');
        const totalText = `${this.users.length} USERS`;
        if (totalBadge && totalBadge.innerText !== totalText) totalBadge.innerText = totalText;

        const allAdmins = this.users.filter(u => u.isMasterAdmin || u.role === 'ADMIN');
        const allMembers = this.users.filter(u => !(u.isMasterAdmin || u.role === 'ADMIN'));

        const pillAll = document.getElementById('pill-filter-all');
        const pillAdmin = document.getElementById('pill-filter-admin');
        const pillMember = document.getElementById('pill-filter-member');

        const allText = `ALL (${this.users.length})`;
        if (pillAll && pillAll.innerText !== allText) pillAll.innerText = allText;
        const adminText = `ADMINS (${allAdmins.length})`;
        if (pillAdmin && pillAdmin.innerText !== adminText) pillAdmin.innerText = adminText;
        const memberText = `MEMBERS (${allMembers.length})`;
        if (pillMember && pillMember.innerText !== memberText) pillMember.innerText = memberText;

        const usersFingerprint = `${this.activeUserRoleFilter}_` + usersList.map(u => `${u.id}_${u.role}_${u.status}_${u.name}_${u.email}_${u.roll_number || ''}_${u.batch || ''}`).join('|');
        if (!force && this.lastUsersTableFingerprint === usersFingerprint && tbody.children.length > 0) {
            return;
        }
        this.lastUsersTableFingerprint = usersFingerprint;

        // Separate current filtered users into Admins and Members
        const adminUsers = usersList.filter(u => u.isMasterAdmin || u.role === 'ADMIN');
        const memberUsers = usersList.filter(u => !(u.isMasterAdmin || u.role === 'ADMIN'));

        const renderRow = (u: AdminUserRecord): string => {
            const statusClass = u.status === 'APPROVED' ? 'approved' : u.status === 'PENDING' ? 'pending' : 'rejected';
            const isMaster = Boolean(u.isMasterAdmin);

            // Format registration date & time in 2 separate lines
            const dt = DashboardManager.formatLogDateTime(u.created_at);
            const dateHtml = `
                <div class="user-reg-date-wrap">
                    <span class="user-reg-date">${escapeHtml(dt.dateStr)}</span>
                    <span class="user-reg-time"><i data-lucide="clock"></i>${escapeHtml(dt.timeStr || '--:--')}</span>
                </div>
            `;

            // Cyber avatar styles
            const avatarGradient = isMaster
                ? 'linear-gradient(135deg, #00f0ff, #facc15)'
                : u.role === 'ADMIN'
                    ? 'linear-gradient(135deg, #ff007a, #9333ea)'
                    : 'linear-gradient(135deg, #00f0ff, #3b82f6)';

            const avatarShadow = isMaster
                ? '0 0 10px rgba(0, 240, 255, 0.4), 0 0 4px rgba(250, 204, 21, 0.3)'
                : u.role === 'ADMIN'
                    ? '0 0 10px rgba(255, 0, 122, 0.35)'
                    : '0 0 8px rgba(0, 240, 255, 0.2)';

            const roleBadge = isMaster
                ? `<span class="badge-role master"><i data-lucide="crown"></i> MASTER ADMIN</span>`
                : u.role === 'ADMIN'
                    ? `<span class="badge-role admin"><i data-lucide="shield"></i> ADMIN</span>`
                    : `<span class="badge-role member"><i data-lucide="user"></i> MEMBER</span>`;

            let actionsHtml = '';
            if (isMaster) {
                actionsHtml = `<span class="badge-perm-admin"><i data-lucide="shield-check"></i> ROOT ACCESS</span>`;
            } else {
                const roleBtn = u.role === 'ADMIN'
                    ? `<button class="btn-table-action btn-demote" data-action="set-role" data-user-id="${escapeHtml(u.id)}" data-role="MEMBER" title="Demote to Member"><i data-lucide="shield-off"></i> Demote</button>`
                    : `<button class="btn-table-action btn-make-admin" data-action="set-role" data-user-id="${escapeHtml(u.id)}" data-role="ADMIN" title="Promote to Admin"><i data-lucide="shield-alert"></i> Make Admin</button>`;

                const deleteBtn = `<button class="btn-table-action btn-del" data-action="delete" data-user-id="${escapeHtml(u.id)}" data-user-name="${this.escapeHtml(u.name)}" title="Permanently Delete User"><i data-lucide="trash-2"></i></button>`;

                actionsHtml = `${roleBtn} ${deleteBtn}`;
            }

            const userBranch = getStudentBranch(u.roll_number, u.batch);
            const metaSub = `<span class="user-cell-subtext">${u.roll_number ? `Roll: ${this.escapeHtml(u.roll_number)}` : ''}${u.roll_number && userBranch ? ' • ' : ''}${userBranch ? `Branch: ${this.escapeHtml(userBranch)}` : ''}</span>`;

            return `
                <tr data-user-id="${u.id}">
                    <td>
                        <div class="user-cell-name">
                            <div class="user-cell-avatar admin-user-clickable" data-user-id="${u.id}" data-user-name="${this.escapeHtml(u.name || 'Anonymous')}" data-user-email="${this.escapeHtml(u.email)}" data-user-roll="${this.escapeHtml(u.roll_number || '')}" data-user-batch="${this.escapeHtml(u.batch || '')}" title="Inspect Profile" style="background: ${avatarGradient}; box-shadow: ${avatarShadow};">
                                ${u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div class="user-cell-meta-wrap">
                                <span class="user-cell-display-name admin-user-clickable" data-user-id="${u.id}" data-user-name="${this.escapeHtml(u.name || 'Anonymous')}" data-user-email="${this.escapeHtml(u.email)}" data-user-roll="${this.escapeHtml(u.roll_number || '')}" data-user-batch="${this.escapeHtml(u.batch || '')}" title="Inspect Profile">${this.escapeHtml(u.name || 'Anonymous')}</span>
                                ${metaSub}
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="user-email-text">${this.escapeHtml(u.email)}</span>
                    </td>
                    <td>
                        <span class="badge-status ${statusClass}">
                            <span class="status-pulse-dot dot-${statusClass}"></span>
                            ${u.status}
                        </span>
                    </td>
                    <td>${roleBadge}</td>
                    <td>${dateHtml}</td>
                    <td><div class="table-actions-cell">${actionsHtml}</div></td>
                </tr>
            `;
        };

        const renderAdminSection = (): string => {
            if (adminUsers.length === 0) {
                return `
                    <tr class="user-group-divider-row admin-group-row">
                        <td colspan="6">
                            <div class="user-group-header">
                                <div class="user-group-title">
                                    <i data-lucide="crown"></i>
                                    <span>ADMINISTRATORS & LEADERSHIP</span>
                                </div>
                                <span class="user-group-badge badge-cyan">0 ADMINS</span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 20px; color: var(--text-dim); font-size: 11px;">
                            No administrators found matching criteria.
                        </td>
                    </tr>
                `;
            }

            return `
                <tr class="user-group-divider-row admin-group-row">
                    <td colspan="6">
                        <div class="user-group-header">
                            <div class="user-group-title">
                                <i data-lucide="crown"></i>
                                <span>ADMINISTRATORS & LEADERSHIP</span>
                            </div>
                            <span class="user-group-badge badge-cyan">${adminUsers.length} ADMINS</span>
                        </div>
                    </td>
                </tr>
                ${adminUsers.map(renderRow).join('')}
            `;
        };

        const renderMemberSection = (): string => {
            if (memberUsers.length === 0) {
                return `
                    <tr class="user-group-divider-row member-group-row">
                        <td colspan="6">
                            <div class="user-group-header">
                                <div class="user-group-title">
                                    <i data-lucide="users"></i>
                                    <span>REGISTERED MEMBERS & STUDENTS</span>
                                </div>
                                <span class="user-group-badge badge-purple">0 MEMBERS</span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 20px; color: var(--text-dim); font-size: 11px;">
                            No registered members found matching criteria.
                        </td>
                    </tr>
                `;
            }

            return `
                <tr class="user-group-divider-row member-group-row">
                    <td colspan="6">
                        <div class="user-group-header">
                            <div class="user-group-title">
                                <i data-lucide="users"></i>
                                <span>REGISTERED MEMBERS & STUDENTS</span>
                            </div>
                            <span class="user-group-badge badge-purple">${memberUsers.length} MEMBERS</span>
                        </div>
                    </td>
                </tr>
                ${memberUsers.map(renderRow).join('')}
            `;
        };

        if (usersList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-dim); font-family: 'Orbitron', sans-serif; font-size: 11px;">
                        <i data-lucide="shield-alert" style="width:20px;height:20px;display:block;margin:0 auto 8px auto;color:#64748b;"></i>
                        No users matching search criteria.
                    </td>
                </tr>
            `;
            renderLucideIcons(tbody);
            return;
        }

        if (this.activeUserRoleFilter === 'admin') {
            tbody.innerHTML = renderAdminSection();
        } else if (this.activeUserRoleFilter === 'member') {
            tbody.innerHTML = renderMemberSection();
        } else {
            tbody.innerHTML = renderAdminSection() + renderMemberSection();
        }

        renderLucideIcons(tbody);
    }

    static async approveUser(id: string) {
        const token = localStorage.getItem('cicr_token');
        const targetUser = this.users.find(u => u.id === id);
        const userName = targetUser?.name || id;
        const userEmail = targetUser?.email || '';

        // 1. INSTANT 1-CLICK OPTIMISTIC UI UPDATE
        if (targetUser) {
            targetUser.status = 'APPROVED';
        }
        this.updateStats();
        this.renderPendingQueue(true);
        const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
        this.renderUsersTable(this.filterUsers(searchInput ? searchInput.value : ''), true);

        ToastManager.show('User Approved', `Member "${userName}" has been granted access.`, 'success');
        DatabaseManager.addLog('system', `Admin approved membership for ${userName} (${userEmail})`);

        // 2. Background sync to server
        try {
            await fetch(`${API_BASE}/auth/admin/users/${id}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.warn('Background user approval note:', e);
        }

        this.loadAuditLogs();
        DatabaseManager.updateNotificationBadges();
    }

    static async rejectUser(id: string) {
        const token = localStorage.getItem('cicr_token');
        const targetUser = this.users.find(u => u.id === id);
        const userName = targetUser?.name || id;

        // 1. INSTANT 1-CLICK OPTIMISTIC UI UPDATE
        if (targetUser) {
            targetUser.status = 'REJECTED';
        }
        this.updateStats();
        this.renderPendingQueue(true);
        const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
        this.renderUsersTable(this.filterUsers(searchInput ? searchInput.value : ''), true);

        ToastManager.show('User Rejected', `Membership request for "${userName}" declined.`, 'warning');
        DatabaseManager.addLog('system', `Admin rejected membership request for ${userName}`);

        // 2. Background sync to server
        try {
            await fetch(`${API_BASE}/auth/admin/users/${id}/reject`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.warn('Background user rejection note:', e);
        }

        this.loadAuditLogs();
        DatabaseManager.updateNotificationBadges();
    }

    static async setRole(id: string, role: 'ADMIN' | 'MEMBER') {
        const token = localStorage.getItem('cicr_token');
        try {
            const res = await fetch(`${API_BASE}/auth/admin/users/${id}/role`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role })
            });
            if (res.ok) {
                ToastManager.show('Role Updated', `User permissions changed to ${role}.`, 'info');
                DatabaseManager.addLog('system', `User ${id} role updated to ${role}`);
                await this.loadUsers(true);
                await this.loadAuditLogs();
            } else {
                const err = await res.json().catch(() => ({}));
                ToastManager.show('Update Failed', err.message || 'Could not update user role', 'error');
            }
        } catch (e) {
            console.error('Error changing role:', e);
            ToastManager.show('Network Error', 'Failed to update user role', 'error');
        }
    }

    static async deleteUser(id: string, name: string) {
        if (!confirm(`Are you sure you want to permanently delete user "${name}"?\n\nThis will remove their profile, credentials, and all records from the database permanently.`)) return;
        const token = localStorage.getItem('cicr_token');
        try {
            // Optimistically update local view immediately
            this.users = this.users.filter(u => u.id !== id);
            const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
            this.renderUsersTable(this.filterUsers(searchInput?.value || ''), true);
            this.renderPendingQueue(true);
            this.updateStats();

            const res = await fetch(`${API_BASE}/auth/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                ToastManager.show('User Deleted', `User "${name}" has been permanently deleted from the database.`, 'warning');
                DatabaseManager.addLog('system', `Admin deleted user profile "${name}" (${id})`);
                await this.loadUsers();
                await this.loadAuditLogs();
                DatabaseManager.updateNotificationBadges();
            } else {
                const err = await res.json().catch(() => ({}));
                ToastManager.show('Delete Failed', err.message || 'Could not delete user from database', 'error');
                await this.loadUsers();
            }
        } catch (e) {
            console.error('Error deleting user:', e);
            ToastManager.show('Network Error', 'Failed to communicate with database server', 'error');
            await this.loadUsers();
        }
    }

    static promptDeleteItem(itemId: string, itemName: string) {
        const modal = document.getElementById('delete-confirm-modal');
        const targetName = document.getElementById('delete-item-target-name');
        const confirmBtn = document.getElementById('btn-confirm-delete') as HTMLButtonElement;
        const cancelBtn = document.getElementById('btn-cancel-delete');
        const closeBtn = document.getElementById('close-delete-confirm');

        if (!modal) return;
        if (targetName) targetName.innerText = itemName;

        modal.style.removeProperty('display');
        modal.classList.add('active');

        const closeModal = () => {
            modal.classList.remove('active');
        };

        if (cancelBtn) cancelBtn.onclick = closeModal;
        if (closeBtn) closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Deleting...';
                try {
                    const token = localStorage.getItem('cicr_token');
                    const res = await fetch(`${API_BASE}/items/${itemId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    const json = await res.json();
                    if (res.ok) {
                        // 1. Immediately remove item from local state & cache
                        inventory = inventory.filter(it => it.id !== itemId && String(it.id) !== String(itemId));
                        DatabaseManager.save();

                        // 2. If detail modal is open for this item, close it
                        if (selectedItem && (selectedItem.id === itemId || String(selectedItem.id) === String(itemId))) {
                            ModalManager.closeAll();
                        }

                        // 3. Close the delete confirm modal
                        closeModal();

                        // 4. Force re-render inventory grid and stats instantly
                        if (window.dashboard) {
                            window.dashboard.renderInventory(true);
                            window.dashboard.renderStats();
                        }

                        ToastManager.show('Item Removed', `"${itemName}" was permanently deleted from the vault.`, 'warning');

                        // 5. Sync from backend and update audit logs
                        await DatabaseManager.syncFromBackend();
                        await AdminManager.loadAuditLogs();
                        DatabaseManager.updateNotificationBadges();
                    } else {
                        ToastManager.show('Delete Error', json.message || 'Failed to delete item.', 'error');
                    }
                } catch (err: any) {
                    console.error('Delete item error:', err);
                    ToastManager.show('Network Error', 'Failed to reach backend API.', 'error');
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i data-lucide="trash-2"></i> Confirm Delete';
                    lucide.createIcons();
                }
            };
        }
        lucide.createIcons();
    }

    public static inspectUserProfile(data: { id?: string; name?: string; email?: string; roll?: string; batch?: string }) {
        const modal = document.getElementById('admin-user-profile-modal');
        if (!modal) return;

        // Try to match registered user
        const matchedUser = this.users.find(u =>
            (data.id && u.id === data.id) ||
            (data.email && u.email.toLowerCase() === data.email.toLowerCase()) ||
            (data.roll && u.roll_number && u.roll_number.toLowerCase() === data.roll.toLowerCase()) ||
            (data.name && u.name.toLowerCase() === data.name.toLowerCase())
        );

        const displayName = matchedUser?.name || data.name || 'Student Borrower';
        const displayEmail = matchedUser?.email || data.email || (data.roll ? `${data.roll}@mail.jiit.ac.in` : '—');
        const displayRoll = matchedUser?.roll_number || data.roll || (displayEmail.includes('@') && !displayEmail.startsWith('—') ? displayEmail.split('@')[0] : '—');
        const displayBranch = getStudentBranch(displayRoll, matchedUser?.batch || data.batch);
        const displayRole = matchedUser?.role || 'MEMBER';
        const displayStatus = matchedUser?.status || 'ACTIVE';

        // Avatar
        const avatarEl = document.getElementById('inspector-user-avatar');
        if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

        // Role badge
        const roleBadgeEl = document.getElementById('inspector-user-role-badge');
        if (roleBadgeEl) {
            roleBadgeEl.textContent = displayRole;
            roleBadgeEl.className = `profile-inspector-role-badge ${displayRole === 'ADMIN' ? 'admin' : ''}`;
        }

        // Name and status
        const nameEl = document.getElementById('inspector-user-name');
        if (nameEl) nameEl.textContent = displayName;

        const statusEl = document.getElementById('inspector-user-status');
        if (statusEl) {
            statusEl.textContent = displayStatus;
            statusEl.className = `profile-status-pill ${displayStatus.toLowerCase()}`;
        }

        // Meta items
        const branchEl = document.getElementById('inspector-user-branch');
        if (branchEl) branchEl.innerHTML = `<i data-lucide="git-branch"></i> <span>Branch: ${AdminManager.escapeHtml(displayBranch)}</span>`;

        const rollEl = document.getElementById('inspector-user-roll');
        if (rollEl) rollEl.innerHTML = `<i data-lucide="hash"></i> <span>Roll: ${AdminManager.escapeHtml(displayRoll)}</span>`;

        const emailEl = document.getElementById('inspector-user-email');
        if (emailEl) emailEl.innerHTML = `<i data-lucide="mail"></i> <span>${AdminManager.escapeHtml(displayEmail)}</span>`;

        // Gather active and historical borrowings for this user
        const normName = displayName.toLowerCase().trim();
        const normEmail = displayEmail.toLowerCase().trim();
        const normRoll = displayRoll.toLowerCase().trim();

        // Check active borrowings from inventory
        const activeLoans: Array<{ itemName: string; category: string; quantity: number; date: string; dueDate?: string; isOverdue: boolean }> = [];
        const now = new Date();

        if (Array.isArray(inventory)) {
            inventory.forEach(item => {
                (item.borrowedBy || []).forEach((b: any) => {
                    const isRet = b.returned || b.status === 'RETURNED';
                    if (isRet) return;
                    const bName = (b.userName || b.borrowerName || b.name || '').toLowerCase().trim();
                    const bEmail = (b.userEmail || b.email || '').toLowerCase().trim();
                    const bRoll = (b.userRoll || b.roll || '').toLowerCase().trim();

                    const matches = (normEmail && bEmail === normEmail) ||
                        (normRoll && normRoll !== '—' && bRoll === normRoll) ||
                        (normName && bName === normName);

                    if (matches) {
                        const rawDueDate = b.dueDate ? new Date(b.dueDate) : null;
                        const isOverdue = rawDueDate && !isNaN(rawDueDate.getTime()) && rawDueDate < now;
                        activeLoans.push({
                            itemName: item.name,
                            category: item.category || 'Component',
                            quantity: Number(b.qty) || Number(b.quantity) || 1,
                            date: b.date || '',
                            dueDate: b.dueDate || undefined,
                            isOverdue: Boolean(isOverdue)
                        });
                    }
                });
            });
        }

        // Also check HardwareLedgerManager.records
        const ledgerRecords = (HardwareLedgerManager as any).records || [];
        const userLedger = ledgerRecords.filter((r: any) => {
            const bName = (r.borrower_name || '').toLowerCase().trim();
            const bEmail = (r.borrower_email || '').toLowerCase().trim();
            const bRoll = (r.borrower_roll || '').toLowerCase().trim();
            return (normEmail && bEmail === normEmail) ||
                (normRoll && normRoll !== '—' && bRoll === normRoll) ||
                (normName && bName === normName);
        });

        const totalCheckoutEvents = userLedger.length;
        const totalReturned = userLedger.filter((r: any) => r.action_type === 'RETURNED' || Boolean(r.return_date) || r.status === 'RETURNED').length;
        const activeLoansCount = Math.max(activeLoans.length, userLedger.filter((r: any) => r.action_type !== 'RETURNED' && !r.return_date && r.status !== 'RETURNED').length);
        const overdueCount = activeLoans.filter(l => l.isOverdue).length;

        const statActive = document.getElementById('inspector-stat-active');
        const statReturned = document.getElementById('inspector-stat-returned');
        const statOverdue = document.getElementById('inspector-stat-overdue');
        const statTotal = document.getElementById('inspector-stat-total');

        if (statActive) statActive.textContent = String(activeLoansCount);
        if (statReturned) statReturned.textContent = String(totalReturned);
        if (statOverdue) statOverdue.textContent = String(overdueCount);
        if (statTotal) statTotal.textContent = String(totalCheckoutEvents);

        // Populate active loans container
        const loansContainer = document.getElementById('inspector-active-loans');
        if (loansContainer) {
            if (activeLoans.length === 0) {
                loansContainer.innerHTML = `
                    <div style="text-align:center; padding: 16px; color:#64748b; font-size: 12px;">
                        <i data-lucide="package-check" style="width:24px;height:24px;display:block;margin:0 auto 8px;color:#39ff14;"></i>
                        No hardware components currently checked out by this member.
                    </div>
                `;
            } else {
                loansContainer.innerHTML = activeLoans.map(loan => `
                    <div class="inspector-loan-item">
                        <div class="inspector-loan-left">
                            <span class="inspector-loan-name">${AdminManager.escapeHtml(loan.itemName)}</span>
                            <span class="inspector-loan-meta">${AdminManager.escapeHtml(loan.category)}</span>
                        </div>
                        <div class="inspector-loan-right">
                            <span class="inspector-loan-qty">${loan.quantity} unit${loan.quantity > 1 ? 's' : ''}</span>
                            <span class="inspector-loan-due ${loan.isOverdue ? 'overdue' : ''}">
                                ${loan.dueDate ? `Due: ${new Date(loan.dueDate).toLocaleDateString()}` : 'Open Loan'}
                                ${loan.isOverdue ? ' (OVERDUE)' : ''}
                            </span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // "Filter In Component Logs" button
        const filterBtn = document.getElementById('btn-inspector-filter-logs');
        if (filterBtn) {
            filterBtn.onclick = () => {
                modal.style.display = 'none';
                if (typeof (window as any).switchSection === 'function') {
                    (window as any).switchSection('hardware-logs-view');
                }
                const searchInput = document.getElementById('hw-ledger-search') as HTMLInputElement;
                if (searchInput) {
                    searchInput.value = displayRoll !== '—' ? displayRoll : displayName;
                    (HardwareLedgerManager as any).searchQuery = searchInput.value.toLowerCase().trim();
                    HardwareLedgerManager.renderTable();
                }
            };
        }

        const closeBtn = document.getElementById('btn-close-user-profile-modal');
        const closeX = document.getElementById('close-user-profile-modal');
        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
        if (closeX) closeX.onclick = () => { modal.style.display = 'none'; };

        modal.style.display = 'flex';
        renderLucideIcons(modal);
    }

    static activeAuditDay: string = 'all';
    static activeAuditDaysRange: number = 7;
    static auditTelemetry: any = null;

    static async loadAuditLogs(resetToFull7Days = false) {
        const token = localStorage.getItem('cicr_token');
        const isAuth = document.body.classList.contains('authenticated') || document.documentElement.classList.contains('is-authenticated');
        if (!token || !isAuth) return;

        if (resetToFull7Days) {
            this.activeAuditDay = 'all';
            this.activeAuditDaysRange = 7;
            this.activeAuditCategory = 'all';

            // Reset category and range pills in UI
            document.querySelectorAll('#admin-audit-pills .audit-pill').forEach(p => {
                p.classList.toggle('active', (p as HTMLElement).dataset.auditCat === 'all');
            });
            document.querySelectorAll('#admin-audit-range-pills .audit-range-pill').forEach(p => {
                p.classList.toggle('active', p.getAttribute('data-range-days') === '7');
            });
        }

        try {
            let url = `${API_BASE}/audit?days=${this.activeAuditDaysRange}&limit=2500&category=${this.activeAuditCategory}`;
            if (this.activeAuditDay && this.activeAuditDay !== 'all') {
                url += `&day=${this.activeAuditDay}`;
            }

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
                this.auditLogs = json.data || [];
                this.auditTelemetry = json;

                this.updateAuditCategoryPills(json.categoryCounts);
                this.renderAuditLogs();

                // Synchronize notifications drawer system tab if currently active
                if (ModalManager.activeNotifTab === 'system') {
                    ModalManager.renderLogsDrawer();
                }
            } else if (res.status === 401) {
                if (typeof AuthManager !== 'undefined') AuthManager.handleLogout();
                return;
            }
        } catch (err) {
            console.warn('[ADMIN] Failed to load 7-day audit logs:', err);
        }
    }

    static updateAuditCategoryPills(counts?: any) {
        if (!counts) return;
        const setCnt = (id: string, val: number) => {
            const el = document.getElementById(id);
            if (el) el.innerText = String(val || 0);
        };
        setCnt('cat-cnt-all', counts.all || 0);
        setCnt('cat-cnt-auth', counts.auth || 0);
        setCnt('cat-cnt-inventory', counts.inventory || 0);
        setCnt('cat-cnt-hardware', counts.hardware || 0);
        setCnt('cat-cnt-loans', counts.loans || 0);
        setCnt('cat-cnt-system', counts.system || 0);
    }

    static renderAuditSpectrum(_dailyCounts?: any) {
        // Spectrum section removed per design update request (Photo 1)
    }

    static renderAuditLogs() {
        const container = document.getElementById('admin-audit-stream');
        const countTag = document.getElementById('admin-audit-count-tag');
        const totalStat = document.getElementById('admin-stat-total-logs');
        if (!container) return;

        // 1. Time range filtering (1d = 24h, 3d = 72h, 7d = all 7 days)
        const now = Date.now();
        const maxAgeMs = (this.activeAuditDaysRange && this.activeAuditDaysRange < 7)
            ? (this.activeAuditDaysRange * 24 * 60 * 60 * 1000)
            : Infinity;

        const rangeFilteredLogs = this.auditLogs.filter(l => {
            if (!l.timestamp || maxAgeMs === Infinity) return true;
            const logTime = new Date(l.timestamp).getTime();
            return !isNaN(logTime) && (now - logTime) <= maxAgeMs;
        });

        // Compute and update category badge counts for the active time window
        const catCounts = {
            all: rangeFilteredLogs.length,
            auth: 0,
            inventory: 0,
            hardware: 0,
            loans: 0,
            system: 0
        };

        rangeFilteredLogs.forEach(l => {
            const act = l.action || '';
            if (['Sign In', 'Sign Up', 'User Approved', 'User Rejected', 'Role Changed', 'User Deleted', 'Password Reset'].includes(act)) {
                catCounts.auth++;
            } else if (['Item Added', 'Item Edited', 'Item Deleted', 'Stock Alert', 'Low Stock'].includes(act)) {
                catCounts.inventory++;
            } else if (['Hardware Requested', 'Hardware Approved', 'Hardware Rejected', 'Hardware Cancelled'].includes(act)) {
                catCounts.hardware++;
            } else if (['Borrowed', 'Returned', 'OTP Requested', 'Item Borrowed', 'Item Returned', 'Approved Return', 'Return Requested'].includes(act)) {
                catCounts.loans++;
            } else {
                catCounts.system++;
            }
        });
        this.updateAuditCategoryPills(catCounts);

        // 2. Category filtering
        let filtered = rangeFilteredLogs;
        if (this.activeAuditCategory && this.activeAuditCategory !== 'all') {
            const cat = this.activeAuditCategory.toLowerCase();
            filtered = filtered.filter(l => {
                const act = l.action || '';
                if (cat === 'auth') {
                    return ['Sign In', 'Sign Up', 'User Approved', 'User Rejected', 'Role Changed', 'User Deleted', 'Password Reset'].includes(act);
                } else if (cat === 'inventory') {
                    return ['Item Added', 'Item Edited', 'Item Deleted', 'Stock Alert', 'Low Stock'].includes(act);
                } else if (cat === 'hardware') {
                    return ['Hardware Requested', 'Hardware Approved', 'Hardware Rejected', 'Hardware Cancelled'].includes(act);
                } else if (cat === 'loans') {
                    return ['Borrowed', 'Returned', 'OTP Requested', 'Item Borrowed', 'Item Returned', 'Approved Return', 'Return Requested'].includes(act);
                } else if (cat === 'system') {
                    return !['Sign In', 'Sign Up', 'User Approved', 'User Rejected', 'Role Changed', 'User Deleted', 'Password Reset',
                             'Item Added', 'Item Edited', 'Item Deleted', 'Stock Alert', 'Low Stock',
                             'Hardware Requested', 'Hardware Approved', 'Hardware Rejected', 'Hardware Cancelled',
                             'Borrowed', 'Returned', 'OTP Requested', 'Item Borrowed', 'Item Returned', 'Approved Return', 'Return Requested'].includes(act);
                }
                return true;
            });
        }

        // 3. Search Term filtering
        if (this.auditSearchTerm) {
            filtered = filtered.filter(l =>
                (l.action && l.action.toLowerCase().includes(this.auditSearchTerm)) ||
                (l.description && l.description.toLowerCase().includes(this.auditSearchTerm)) ||
                (l.users?.name && l.users.name.toLowerCase().includes(this.auditSearchTerm)) ||
                (l.users?.email && l.users.email.toLowerCase().includes(this.auditSearchTerm)) ||
                (l.inventory?.name && l.inventory.name.toLowerCase().includes(this.auditSearchTerm))
            );
        }

        if (countTag) countTag.innerText = `${filtered.length} EVENTS`;
        if (totalStat) totalStat.innerText = String(rangeFilteredLogs.length);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="admin-empty-state">
                    <i data-lucide="check-circle-2"></i>
                    <p>No audit log events found matching the criteria in the 7-day retention window.</p>
                </div>
            `;
            renderLucideIcons(container);
            return;
        }

        container.innerHTML = filtered.map(log => {
            const action = log.action || 'System Event';
            let badgeClass = 'action-cyan';
            let iconName = 'activity';
            let cardCat = 'cat-system';

            if (['Item Added', 'Hardware Approved', 'User Approved', 'Returned', 'Item Returned', 'Approved Return'].includes(action)) {
                badgeClass = 'action-green';
                iconName = 'check-circle';
                cardCat = 'cat-inventory';
            } else if (['Item Deleted', 'Hardware Rejected', 'User Rejected', 'User Deleted'].includes(action)) {
                badgeClass = 'action-red';
                iconName = 'alert-octagon';
                cardCat = 'cat-danger';
            } else if (['Sign In', 'Sign Up', 'Role Changed', 'Password Reset'].includes(action)) {
                badgeClass = 'action-purple';
                iconName = action === 'Sign In' ? 'log-in' : action === 'Password Reset' ? 'key' : 'user-plus';
                cardCat = 'cat-auth';
            } else if (['Borrowed', 'Item Borrowed', 'Hardware Requested'].includes(action)) {
                badgeClass = 'action-yellow';
                iconName = 'package';
                cardCat = 'cat-loans';
            } else if (['Item Edited', 'Stock Alert'].includes(action)) {
                badgeClass = 'action-cyan';
                iconName = 'cpu';
                cardCat = 'cat-inventory';
            }

            const rawTime = log.timestamp || log.created_at || new Date().toISOString();
            const dt = DashboardManager.formatLogDateTime(rawTime);
            const timeAgo = this.formatTimeAgo(rawTime);

            const actorName = log.users?.name || (log.user_id ? 'Member' : 'System');
            const actorEmail = log.users?.email || '';

            return `
                <div class="audit-log-card ${cardCat}" data-log-id="${escapeHtml(log.id)}" title="Click to view raw event telemetry metadata">
                    <div class="audit-left-col">
                        <span class="audit-action-badge ${badgeClass}">
                            <i data-lucide="${iconName}" style="width: 11px; height: 11px;"></i>
                            ${action}
                        </span>
                        <div class="audit-content-block">
                            <span class="audit-desc-text">${this.escapeHtml(log.description || 'Action recorded')}</span>
                            <div class="audit-meta-chips">
                                <span class="audit-actor-chip"><i data-lucide="user" style="width: 11px; height: 11px;"></i> <strong>${actorName}</strong> ${actorEmail ? `(${actorEmail})` : ''}</span>
                                ${log.inventory?.name ? `<span class="audit-actor-chip" style="color: #00f0ff;"><i data-lucide="box" style="width: 11px; height: 11px;"></i> ${log.inventory.name}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="audit-right-col">
                        <span class="audit-date-line">${dt.dateStr}</span>
                        <span class="audit-time-line">${dt.timeStr} <span class="audit-ago-sub">(${timeAgo})</span></span>
                    </div>
                </div>
            `;
        }).join('');

        renderLucideIcons(container);
    }

    static openAuditDetail(logId: string) {
        const log = this.auditLogs.find(l => l.id === logId);
        if (!log) return;

        const modal = document.getElementById('audit-detail-modal');
        if (!modal) return;

        const badgeEl = document.getElementById('audit-modal-badge');
        const timeEl = document.getElementById('audit-modal-time');
        const actorEl = document.getElementById('audit-modal-actor');
        const emailEl = document.getElementById('audit-modal-email');
        const itemEl = document.getElementById('audit-modal-item');
        const isoEl = document.getElementById('audit-modal-iso');
        const descEl = document.getElementById('audit-modal-desc');
        const jsonEl = document.getElementById('audit-modal-json');

        const rawTime = log.timestamp || log.created_at || new Date().toISOString();
        const dt = DashboardManager.formatLogDateTime(rawTime);
        const timeAgo = this.formatTimeAgo(rawTime);

        if (badgeEl) badgeEl.innerText = log.action || 'SYSTEM EVENT';
        if (timeEl) timeEl.innerText = `${dt.dateStr} ${dt.timeStr} (${timeAgo})`;
        if (actorEl) actorEl.innerText = log.users?.name || (log.user_id ? 'Authenticated Member' : 'System Engine');
        if (emailEl) emailEl.innerText = log.users?.email || '—';
        if (itemEl) itemEl.innerText = log.inventory?.name || (log.item_id || '—');
        if (isoEl) isoEl.innerText = rawTime;
        if (descEl) descEl.innerText = log.description || 'No detailed description available.';
        if (jsonEl) jsonEl.innerText = JSON.stringify(log, null, 2);

        modal.classList.add('active');
        renderLucideIcons(modal);
    }

    static exportAuditLogsCSV() {
        if (!this.auditLogs || this.auditLogs.length === 0) {
            ToastManager.show('Export Empty', 'No audit logs available to export.', 'warning');
            return;
        }

        const headers = ['Timestamp', 'Action', 'Actor Name', 'Actor Email', 'Target Item', 'Description'];
        const rows = this.auditLogs.map(l => [
            `"${l.timestamp || ''}"`,
            `"${(l.action || '').replace(/"/g, '""')}"`,
            `"${(l.users?.name || '').replace(/"/g, '""')}"`,
            `"${(l.users?.email || '').replace(/"/g, '""')}"`,
            `"${(l.inventory?.name || '').replace(/"/g, '""')}"`,
            `"${(l.description || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `cicr_audit_ledger_7days_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        ToastManager.show('Report Exported', `Downloaded 7-day audit ledger (${this.auditLogs.length} events).`, 'success');
    }

    static async triggerAuditRetentionCleanup() {
        const token = localStorage.getItem('cicr_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/audit/cleanup`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (res.ok) {
                ToastManager.show('Retention Enforced', '7-Day backend retention sync complete. Expired records pruned.', 'success');
                await this.loadAuditLogs();
            } else {
                ToastManager.show('Cleanup Failed', json.message || 'Could not enforce retention.', 'error');
            }
        } catch (err: any) {
            ToastManager.show('Network Error', 'Failed to reach retention cleanup endpoint.', 'error');
        }
    }

    static formatTimeAgo(dateStr: string): string {
        const d = new Date(dateStr).getTime();
        if (isNaN(d)) return 'Recently';
        const diff = Math.floor((Date.now() - d) / 1000);
        if (diff < 30) return 'JUST NOW';
        if (diff < 60) return `${diff}S AGO`;
        if (diff < 3600) return `${Math.floor(diff / 60)}M AGO`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}H AGO`;
        return `${Math.floor(diff / 86400)}D AGO`;
    }

    static escapeHtml(str: string): string {
        return escapeHtml(str);
    }
}


// ==========================================
// Terminal Simulator Logic
// ==========================================
class TerminalSimulator {
    static start() {
        const body = document.getElementById('terminal-log-body');
        if (!body) return;
        body.innerHTML = '';

        const lines = [
            { text: "Initializing CICR Core OS v3.5...", color: "#f3f4f6" },
            { text: "Establishing telemetry link to local JIIT-128 robotics vault...", color: "#f3f4f6" },
            { text: "Robotics telemetry buffers initialized successfully [OK]", color: "#39ff14" },
            { text: "Connecting to Qdrant vector database: Index hardware_kb loaded", color: "#00f0ff" },
            { text: "Seeding RAG knowledge base (STM32 manuals + pinouts)...", color: "#f3f4f6" },
            { text: "LangGraph workflow network compiled: 8 agent nodes ready", color: "#f3f4f6" },
            { text: "Vision Node: YOLOv11 component classification weights checked", color: "#ff007a" },
            { text: "Vision Node: SAM2 segmented coordinate maps ready", color: "#bd00ff" },
            { text: "MCP Server: Exposing tools: checkout_item, query_stock", color: "#ffd700" }
        ];

        let lineIdx = 0;

        function appendNextLine() {
            if (lineIdx >= lines.length) return;

            const line = lines[lineIdx];
            const lineEl = document.createElement('div');
            lineEl.className = 'terminal-line';
            body!.appendChild(lineEl);
            body!.scrollTop = body!.scrollHeight;

            let charIdx = 0;
            lineEl.innerHTML = `<span style="color: ${line.color}">&rarr;&nbsp;&rarr;&nbsp;</span><span class="txt-content" style="color: ${line.color}"></span>`;
            const txtSpan = lineEl.querySelector('.txt-content') as HTMLElement;

            lineEl.classList.add('visible');

            const cursorSpan = document.createElement('span');
            cursorSpan.className = 'cursor';
            lineEl.appendChild(cursorSpan);

            function typeChar() {
                if (charIdx < line.text.length) {
                    txtSpan.textContent += line.text[charIdx];
                    charIdx++;
                    setTimeout(typeChar, 25);
                } else {
                    cursorSpan.remove();

                    if (lineIdx === lines.length - 1) {
                        const finalCursor = document.createElement('span');
                        finalCursor.className = 'cursor';
                        lineEl.appendChild(finalCursor);

                        // Always keep typing: clear terminal logs and restart after 4 seconds!
                        setTimeout(() => {
                            body!.innerHTML = '';
                            lineIdx = 0;
                            appendNextLine();
                        }, 4000);
                    } else {
                        lineIdx++;
                        setTimeout(appendNextLine, 350);
                    }
                }
            }
            typeChar();
        }

        appendNextLine();
    }
}




// Extend global window interface for development debugging & admin actions
declare global {
    interface Window {
        bg3D?: Background3D;
        dashboard?: DashboardManager;
        openBulkReturnModal?: () => void;
        openPasswordResetModal?: () => void;
    }
}

// ==========================================
// Team Showcase Manager (GDG JIIT Style Interactive Showcase)
// ==========================================
interface TeamMember {
    id: string;
    name: string;
    role: string;
    greeting?: string;
    avatar: string;
    avatarPos: string;
    accentColor: string;
    firstNameColor?: string;
    lastNameColor?: string;
    socials: {
        platform: 'linkedin' | 'github';
        label: string;
        url: string;
    }[];
}

class TeamShowcaseManager {
    private static activeCategory: 'mentors' | 'team' = 'team';
    private static activeIndex: number = 0;
    private static isInitialized: boolean = false;

    private static readonly MENTORS: TeamMember[] = [
        {
            id: 'gunjan',
            name: 'Gunjan Pal',
            role: 'Core Team',
            greeting: 'Hi, my name is',
            avatar: '/devs/gunjan.jpg',
            avatarPos: 'center 20%',
            accentColor: '#bd00ff',
            firstNameColor: '#bd00ff',
            lastNameColor: '#ff007a',
            socials: [
                { platform: 'linkedin', label: 'Gunjan Pal', url: 'https://www.linkedin.com/in/gunjan-pal-796093284/' },
                { platform: 'github', label: 'Gunjan00001', url: 'https://github.com/Gunjan00001' }
            ]
        }
    ];

    private static readonly TEAM: TeamMember[] = [
        {
            id: 'vardaan',
            name: 'Vardaan Saxena',
            role: 'Frontend + Integration',
            greeting: 'Hi, my name is',
            avatar: '/devs/vardaan.jpg',
            avatarPos: 'center 24%',
            accentColor: '#00f0ff',
            firstNameColor: '#ff3366',
            lastNameColor: '#00f0ff',
            socials: [
                { platform: 'linkedin', label: 'Vardaan Saxena', url: 'https://www.linkedin.com/in/vardaan-saxena-b4b4a4365/' },
                { platform: 'github', label: 'simplyvardaan', url: 'https://github.com/simplyvardaan/' }
            ]
        },
        {
            id: 'kushagra',
            name: 'Kushagra Garg',
            role: 'Backend',
            greeting: 'Hi, my name is',
            avatar: '/devs/kushagra.png',
            avatarPos: 'center 8%',
            accentColor: '#00ff88',
            firstNameColor: '#00ff88',
            lastNameColor: '#00f0ff',
            socials: [
                { platform: 'linkedin', label: 'Kushagra Garg', url: 'https://www.linkedin.com/in/kushagra-garg-10bab5377/' },
                { platform: 'github', label: 'Sun-fire-nikka', url: 'https://github.com/Sun-fire-nikka' }
            ]
        },
        {
            id: 'mahak',
            name: 'Mahak Katahara',
            role: 'Contributor',
            greeting: 'Hi, my name is',
            avatar: '/devs/mahak.png',
            avatarPos: 'center 18%',
            accentColor: '#ff007a',
            firstNameColor: '#ff007a',
            lastNameColor: '#bd00ff',
            socials: [
                { platform: 'linkedin', label: 'Mahak Katahara', url: 'https://www.linkedin.com/in/mahak-katahara-947122389/' },
                { platform: 'github', label: 'mahakkatahara', url: 'https://github.com/mahakkatahara' }
            ]
        },
        {
            id: 'divyam',
            name: 'Divyam Jain',
            role: 'Beta Tester',
            greeting: 'Hi, my name is',
            avatar: '/devs/divyam.png',
            avatarPos: 'center 15%',
            accentColor: '#ffb703',
            firstNameColor: '#ffb703',
            lastNameColor: '#00f0ff',
            socials: [
                { platform: 'linkedin', label: 'Divyam Jain', url: 'https://www.linkedin.com/in/divyamjain8108' },
                { platform: 'github', label: 'DJByteForge', url: 'https://github.com/DJByteForge' }
            ]
        }
    ];

    public static init() {
        this.bindEvents();
        this.renderCategory(this.activeCategory);
    }

    private static getCurrentList(): TeamMember[] {
        return this.activeCategory === 'mentors' ? this.MENTORS : this.TEAM;
    }

    public static setCategory(category: 'mentors' | 'team') {
        this.activeCategory = category;
        this.activeIndex = 0;
        this.renderCategory(category);
    }

    public static selectMember(index: number) {
        const list = this.getCurrentList();
        if (index < 0) index = list.length - 1;
        if (index >= list.length) index = 0;
        this.activeIndex = index;
        this.renderHeroCard(list[this.activeIndex]);
        this.updateCarouselActiveState();
    }

    public static nextMember() {
        this.selectMember(this.activeIndex + 1);
    }

    public static prevMember() {
        this.selectMember(this.activeIndex - 1);
    }

    private static renderCategory(category: 'mentors' | 'team') {
        // Update tab button active states
        const tabMentors = document.getElementById('team-tab-mentors');
        const tabTeam = document.getElementById('team-tab-team');
        if (tabMentors) tabMentors.classList.toggle('active', category === 'mentors');
        if (tabTeam) tabTeam.classList.toggle('active', category === 'team');

        const tabMentorsCount = document.querySelector('#team-tab-mentors .category-count');
        if (tabMentorsCount) tabMentorsCount.textContent = String(this.MENTORS.length);
        const tabTeamCount = document.querySelector('#team-tab-team .category-count');
        if (tabTeamCount) tabTeamCount.textContent = String(this.TEAM.length);

        const list = this.getCurrentList();
        if (this.activeIndex >= list.length) this.activeIndex = 0;

        // Render carousel track avatars
        const track = document.getElementById('team-carousel-track');
        if (track) {
            track.innerHTML = list.map((m, idx) => `
                <button type="button" class="team-avatar-selector ${idx === this.activeIndex ? 'active' : ''}" data-index="${idx}" aria-label="View profile of ${m.name}">
                    <div class="selector-avatar-circle" style="--accent: ${m.accentColor};">
                        <img src="${m.avatar}" alt="${m.name}" class="selector-avatar-img" style="object-position: ${m.avatarPos};" loading="lazy">
                    </div>
                    <span class="selector-avatar-name">${m.name.split(' ')[0]}</span>
                </button>
            `).join('');

            // Add click & touch listeners to avatar items
            track.querySelectorAll('.team-avatar-selector').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const idx = parseInt(btn.getAttribute('data-index') || '0', 10);
                    this.selectMember(idx);
                });
            });
        }

        // Render Hero Card for current active member
        this.renderHeroCard(list[this.activeIndex]);
        this.updateArrowStates();
    }

    private static renderHeroCard(m: TeamMember) {
        const card = document.getElementById('team-hero-card');
        const avatarImg = document.getElementById('hero-avatar-img') as HTMLImageElement;
        const rolePill = document.getElementById('hero-role-pill');
        const displayName = document.getElementById('hero-display-name');
        const socialLinks = document.getElementById('hero-social-links');
        const ambientGlow = document.getElementById('hero-ambient-glow');
        const glowRing = document.getElementById('hero-avatar-glow-ring');

        if (!m) return;

        // Split name for GDG JIIT style dual-color headline
        const nameParts = m.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Trigger subtle animation
        if (card) {
            card.classList.remove('hero-fade-active');
            void card.offsetWidth; // Force reflow
            card.classList.add('hero-fade-active');
            card.style.setProperty('--card-accent', m.accentColor);
        }

        if (avatarImg) {
            avatarImg.src = m.avatar;
            avatarImg.alt = m.name;
            avatarImg.style.objectPosition = m.avatarPos;
        }

        if (rolePill) {
            rolePill.textContent = m.role;
            rolePill.style.color = m.accentColor;
            rolePill.style.borderColor = `${m.accentColor}66`;
            rolePill.style.boxShadow = `0 0 14px ${m.accentColor}33`;
        }

        if (displayName) {
            displayName.style.setProperty('--first-name-color', m.firstNameColor || m.accentColor);
            displayName.style.setProperty('--last-name-color', m.lastNameColor || m.accentColor);
            displayName.innerHTML = `
                <span class="hero-first-name">${firstName}</span>
                <span class="hero-last-name">${lastName}</span>
            `;
        }

        if (ambientGlow) {
            ambientGlow.style.background = m.accentColor;
        }

        if (glowRing) {
            glowRing.style.background = `conic-gradient(from 180deg, ${m.accentColor}, #bd00ff, #ff007a, ${m.accentColor})`;
            glowRing.style.boxShadow = `0 0 38px ${m.accentColor}66, 0 0 16px rgba(189, 0, 255, 0.3)`;
        }

        const getSocialIconSvg = (platform: 'linkedin' | 'github') => {
            if (platform === 'github') {
                return `<svg class="social-icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`;
            }
            if (platform === 'linkedin') {
                return `<svg class="social-icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`;
            }
            return '';
        };

        if (socialLinks) {
            socialLinks.innerHTML = m.socials.map(s => `
                <a href="${s.url}" target="_blank" rel="noopener noreferrer" class="hero-social-pill" title="${m.name} on ${s.platform === 'github' ? 'GitHub' : 'LinkedIn'}">
                    ${getSocialIconSvg(s.platform)}
                    <span>${s.label}</span>
                </a>
            `).join('');
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    private static updateArrowStates() {
        const list = this.getCurrentList();
        const btnPrev = document.getElementById('team-carousel-prev') as HTMLButtonElement | null;
        const btnNext = document.getElementById('team-carousel-next') as HTMLButtonElement | null;
        if (btnPrev && btnNext) {
            if (list.length <= 1) {
                btnPrev.style.opacity = '0.3';
                btnPrev.style.pointerEvents = 'none';
                btnNext.style.opacity = '0.3';
                btnNext.style.pointerEvents = 'none';
            } else {
                btnPrev.style.opacity = '1';
                btnPrev.style.pointerEvents = 'auto';
                btnNext.style.opacity = '1';
                btnNext.style.pointerEvents = 'auto';
            }
        }
    }

    private static updateCarouselActiveState() {
        const track = document.getElementById('team-carousel-track');
        if (!track) return;

        const items = track.querySelectorAll('.team-avatar-selector');
        items.forEach((item, idx) => {
            const isActive = idx === this.activeIndex;
            item.classList.toggle('active', isActive);
            if (isActive) {
                try {
                    item.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                } catch (_) {}
            }
        });
        this.updateArrowStates();
    }

    private static bindEvents() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        const tabMentors = document.getElementById('team-tab-mentors');
        const tabTeam = document.getElementById('team-tab-team');
        const btnPrev = document.getElementById('team-carousel-prev');
        const btnNext = document.getElementById('team-carousel-next');

        if (tabMentors) {
            tabMentors.addEventListener('click', () => this.setCategory('mentors'));
        }

        if (tabTeam) {
            tabTeam.addEventListener('click', () => this.setCategory('team'));
        }

        // Highly responsive, touch-optimized side arrow navigation with debounce
        let lastNavTime = 0;
        const throttledNav = (action: () => void) => (e: Event) => {
            const now = Date.now();
            if (now - lastNavTime < 200) {
                e.preventDefault();
                return;
            }
            lastNavTime = now;
            e.preventDefault();
            e.stopPropagation();
            action();
        };

        if (btnPrev) {
            const onPrev = throttledNav(() => this.prevMember());
            btnPrev.addEventListener('click', onPrev);
            btnPrev.addEventListener('touchend', onPrev, { passive: false });
        }

        if (btnNext) {
            const onNext = throttledNav(() => this.nextMember());
            btnNext.addEventListener('click', onNext);
            btnNext.addEventListener('touchend', onNext, { passive: false });
        }

        // Touch swipe gestures for mobile on hero card and carousel container
        let touchStartX = 0;
        let touchStartY = 0;
        const heroCardEl = document.getElementById('team-hero-card');
        const carouselEl = document.querySelector('.team-selector-carousel-container');

        const attachSwipe = (el: Element | null) => {
            if (!el) return;
            el.addEventListener('touchstart', (e: any) => {
                if (e.touches && e.touches.length === 1) {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                }
            }, { passive: true });

            el.addEventListener('touchend', (e: any) => {
                if (e.changedTouches && e.changedTouches.length === 1) {
                    const deltaX = e.changedTouches[0].clientX - touchStartX;
                    const deltaY = e.changedTouches[0].clientY - touchStartY;
                    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
                        if (deltaX < 0) {
                            this.nextMember();
                        } else {
                            this.prevMember();
                        }
                    }
                }
            }, { passive: true });
        };

        attachSwipe(heroCardEl);
        attachSwipe(carouselEl);

        // Keyboard navigation support when viewing developers section
        document.addEventListener('keydown', (e) => {
            const devSection = document.getElementById('developers-view');
            if (!devSection || devSection.style.display === 'none') return;
            if (e.key === 'ArrowLeft') {
                this.prevMember();
            } else if (e.key === 'ArrowRight') {
                this.nextMember();
            }
        });
    }
}

(window as any).TeamShowcaseManager = TeamShowcaseManager;

// ==========================================
// Profile View Manager System (Aesthetic Operator HUD)
// ==========================================
class ProfileViewManager {
    private static isInitialized: boolean = false;
    public static activeTab: 'loans' | 'requests' | 'history' = 'loans';
    private static cachedRequests: any[] = [];
    public static cachedHistory: any[] = [];

    public static init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // 1. Password Reset / Security button inside profile view
        const editBtn = document.getElementById('profile-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof PasswordResetManager !== 'undefined' && typeof PasswordResetManager.open === 'function') {
                    PasswordResetManager.open();
                } else {
                    const modal = document.getElementById('reset-password-modal');
                    if (modal) modal.classList.add('active');
                }
            });
        }

        const secBtn = document.getElementById('profile-security-btn');
        if (secBtn) {
            secBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof PasswordResetManager !== 'undefined' && typeof PasswordResetManager.open === 'function') {
                    PasswordResetManager.open();
                } else {
                    const modal = document.getElementById('reset-password-modal');
                    if (modal) modal.classList.add('active');
                }
            });
        }

        // 2. Edit Profile Modal triggers (Aesthetic Operator HUD & Camera Click)
        const openEditBtn = document.getElementById('profile-open-edit-btn');
        if (openEditBtn) {
            openEditBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof ProfileEditManager !== 'undefined') {
                    ProfileEditManager.open();
                }
            });
        }

        const avatarTrigger = document.getElementById('profile-avatar-edit-trigger');
        if (avatarTrigger) {
            avatarTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof ProfileEditManager !== 'undefined') {
                    ProfileEditManager.open();
                }
            });
        }

        // 3. Profile Logout button inside profile view
        const logoutBtn = document.getElementById('profile-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof AuthManager !== 'undefined' && typeof AuthManager.promptLogout === 'function') {
                    AuthManager.promptLogout();
                } else {
                    const navLogout = document.getElementById('nav-logout');
                    if (navLogout) navLogout.click();
                }
            });
        }

        // 4. Hardware Hub Tabs switching
        const tabBtns = document.querySelectorAll('.profile-hub-tab');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = (btn as HTMLElement).dataset.hubTab as 'loans' | 'requests' | 'history';
                if (targetTab) {
                    this.switchTab(targetTab);
                }
            });
        });
    }

    public static switchTab(tab: 'loans' | 'requests' | 'history') {
        this.activeTab = tab;
        const tabBtns = document.querySelectorAll('.profile-hub-tab');
        tabBtns.forEach(btn => {
            const isMatch = (btn as HTMLElement).dataset.hubTab === tab;
            btn.classList.toggle('active', isMatch);
        });

        const paneLoans = document.getElementById('pane-active-loans');
        const paneRequests = document.getElementById('pane-pending-requests');
        const paneHistory = document.getElementById('pane-return-history');

        if (paneLoans) {
            paneLoans.style.display = tab === 'loans' ? 'block' : 'none';
            paneLoans.classList.toggle('active', tab === 'loans');
        }
        if (paneRequests) {
            paneRequests.style.display = tab === 'requests' ? 'block' : 'none';
            paneRequests.classList.toggle('active', tab === 'requests');
        }
        if (paneHistory) {
            paneHistory.style.display = tab === 'history' ? 'block' : 'none';
            paneHistory.classList.toggle('active', tab === 'history');
        }
    }

    public static async syncFromBackend() {
        const token = localStorage.getItem('cicr_token');
        if (!token) return;

        try {
            const headers = { 'Authorization': `Bearer ${token}` };

            // In parallel, fetch profile, hardware requests, and borrow history
            const [profileRes, requestsRes, historyRes] = await Promise.allSettled([
                fetch(`${API_BASE}/auth/profile`, { headers }),
                fetch(`${API_BASE}/borrow/requests`, { headers }),
                fetch(`${API_BASE}/borrow/history`, { headers })
            ]);

            // 1. Process profile
            if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
                const json = await profileRes.value.json();
                if (json.status === 'success' && json.data) {
                    let user: any = {};
                    try {
                        user = JSON.parse(localStorage.getItem('cicr_user') || '{}');
                    } catch { }
                    const merged = { ...user, ...json.data };
                    localStorage.setItem('cicr_user', JSON.stringify(merged));
                    if (json.data.username) {
                        localStorage.setItem('cicr_auth', json.data.username);
                    }
                }
            }

            // 2. Process hardware requests
            if (requestsRes.status === 'fulfilled' && requestsRes.value.ok) {
                const reqJson = await requestsRes.value.json();
                if (reqJson.status === 'success' && Array.isArray(reqJson.data)) {
                    this.cachedRequests = reqJson.data;
                }
            }

            // 3. Process borrow history
            if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
                const histJson = await historyRes.value.json();
                if (histJson.status === 'success' && Array.isArray(histJson.data)) {
                    this.cachedHistory = histJson.data;
                }
            }

            this.render(false);
        } catch (e) {
            console.warn('[ProfileView] Backend sync notice:', e);
        }
    }

    public static render(triggerSync: boolean = true) {
        this.init();
        if (triggerSync) {
            this.syncFromBackend();
        }

        let user: any = {};
        try {
            user = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        } catch {
            user = {};
        }

        const authName = localStorage.getItem('cicr_auth') || '';
        const name = (user.name || user.username || authName || 'Operator').trim();
        const username = (user.username || (authName ? authName.toLowerCase() : 'operator')).trim();
        const role = (user.role || localStorage.getItem('cicr_user_role') || 'MEMBER').toUpperCase();
        const roll = (user.roll_number || user.roll || '').trim();
        const email = (user.email || (roll ? `${roll}@mail.jiit.ac.in` : '')).trim() || (authName.includes('@') ? authName : '');
        const branch = getStudentBranch(roll, user.branch || user.batch);

        // Hero initials & avatar image sync
        const heroAvatarImg = document.getElementById('profile-hero-avatar-img') as HTMLImageElement;
        const heroInitial = document.getElementById('profile-hero-initial');
        if (heroAvatarImg && heroInitial) {
            if (user.avatar_url) {
                heroAvatarImg.src = user.avatar_url;
                heroAvatarImg.style.display = 'block';
                heroInitial.style.display = 'none';
            } else {
                heroAvatarImg.style.display = 'none';
                heroInitial.style.display = 'block';
                heroInitial.textContent = (name.charAt(0) || 'U').toUpperCase();
            }
        } else if (heroInitial) {
            heroInitial.textContent = (name.charAt(0) || 'U').toUpperCase();
        }

        // Sidebar avatar & initial sync
        const sidebarAvatarImg = document.getElementById('sidebar-avatar-img') as HTMLImageElement;
        const sidebarInitial = document.getElementById('profile-avatar-initial');
        if (sidebarAvatarImg && sidebarInitial) {
            if (user.avatar_url) {
                sidebarAvatarImg.src = user.avatar_url;
                sidebarAvatarImg.style.display = 'block';
                sidebarInitial.style.display = 'none';
            } else {
                sidebarAvatarImg.style.display = 'none';
                sidebarInitial.style.display = 'flex';
                const initialTextEl = document.getElementById('sidebar-avatar-initial-text');
                if (initialTextEl) {
                    initialTextEl.textContent = (name.charAt(0) || 'U').toUpperCase();
                    initialTextEl.style.display = 'flex';
                } else {
                    sidebarInitial.textContent = (name.charAt(0) || 'U').toUpperCase();
                }
            }
        } else if (sidebarInitial) {
            sidebarInitial.style.display = 'flex';
            const initialTextEl = document.getElementById('sidebar-avatar-initial-text');
            if (initialTextEl) {
                initialTextEl.textContent = (name.charAt(0) || 'U').toUpperCase();
                initialTextEl.style.display = 'flex';
            } else {
                sidebarInitial.textContent = (name.charAt(0) || 'U').toUpperCase();
            }
        }

        const heroName = document.getElementById('profile-hero-display-name');
        if (heroName) heroName.textContent = name;

        const heroHandle = document.getElementById('profile-hero-handle');
        if (heroHandle) heroHandle.textContent = `@${username}`;

        const heroEmail = document.getElementById('profile-hero-email');
        if (heroEmail) heroEmail.textContent = email;

        const heroRollTag = document.getElementById('profile-hero-roll-text');
        if (heroRollTag) heroRollTag.textContent = roll ? `Roll No: ${roll}` : 'Roll: JIIT Member';

        const heroBranchTag = document.getElementById('profile-hero-branch-text');
        if (heroBranchTag) heroBranchTag.textContent = branch ? `Branch: ${branch}` : 'Branch: CSE';



        // Institutional Credentials
        const credName = document.getElementById('cred-full-name');
        if (credName) credName.textContent = name;

        const credRoll = document.getElementById('cred-roll-no');
        if (credRoll) credRoll.textContent = roll || 'Not Linked';

        const credMail = document.getElementById('cred-email');
        if (credMail) credMail.textContent = email;

        const credBranch = document.getElementById('cred-branch');
        if (credBranch) credBranch.textContent = branch || 'CSE';

        const credRol = document.getElementById('cred-role');
        if (credRol) {
            credRol.innerHTML = role === 'ADMIN'
                ? '<span class="role-pill-admin"><i data-lucide="shield-alert"></i> Administrator</span>'
                : '<span class="role-pill-member"><i data-lucide="shield-check"></i> Verified Member</span>';
        }

        // Active Hardware Loans Calculation
        const activeLoans: { item: InventoryItem; rec: BorrowRecord; origIdx: number }[] = [];
        let totalReturnedCount = 0;

        inventory.forEach(item => {
            (item.borrowedBy || []).forEach((rec, idx) => {
                if (ModalManager.isUserLoanMatch(rec)) {
                    if (rec.returned || (rec as any).status === 'RETURNED') {
                        totalReturnedCount += (rec.qty || (rec as any).quantity || 1);
                    } else {
                        activeLoans.push({ item, rec, origIdx: idx });
                    }
                }
            });
        });

        // Supplement with cachedHistory to guarantee active loans never disappear
        if (Array.isArray(this.cachedHistory)) {
            this.cachedHistory.forEach((h: any) => {
                if (h.status === 'RETURNED') {
                    if (!activeLoans.some(l => l.rec.id === h.id)) {
                        totalReturnedCount += (Number(h.quantity) || 1);
                    }
                } else if (h.status === 'BORROWED' || h.status === 'RETURN_REQUESTED') {
                    const alreadyIn = activeLoans.some(l => l.rec.id === h.id);
                    if (!alreadyIn) {
                        let item = inventory.find(i => String(i.id) === String(h.inventory_id || h.inventory?.id));
                        if (!item) {
                            item = {
                                id: String(h.inventory_id || h.inventory?.id || `item-${h.id}`),
                                name: h.inventory?.name || 'Hardware Component',
                                category: (h.inventory?.category || 'microcontrollers').toLowerCase(),
                                quantity: Number(h.quantity) || 1,
                                availableQuantity: 0,
                                location: 'Lab Shelf',
                                specs: 'Hardware Component',
                                image: h.inventory?.image || 'microchip.jpg',
                                tags: [],
                                borrowedBy: []
                            };
                        }
                        const rec: BorrowRecord = {
                            id: h.id,
                            name: h.borrower_name || h.users?.name || 'Member',
                            userName: h.borrower_name || h.users?.name || 'Member',
                            borrowerName: h.borrower_name || h.users?.name || 'Member',
                            roll: h.roll_number || h.users?.roll_number || '',
                            userRoll: h.roll_number || h.users?.roll_number || '',
                            email: h.borrower_email || h.users?.email || '',
                            userEmail: h.borrower_email || h.users?.email || '',
                            userId: h.user_id,
                            qty: Number(h.quantity) || 1,
                            purpose: h.purpose || 'Active Loan',
                            date: h.borrowed_at || new Date().toISOString(),
                            dueDate: h.due_date || null,
                            status: h.status,
                            returned: false
                        };
                        activeLoans.push({ item, rec, origIdx: 0 });
                    }
                }
            });
        }

        const MAX_LOAN_QUOTA = 5;
        const activeCount = activeLoans.length;

        // Pending requests calculation
        const pendingReqs = this.cachedRequests.filter(r => {
            const s = (r.status || '').toUpperCase();
            return s === 'PENDING' || s === 'SUBMITTED' || s === 'RETURN_REQUESTED';
        });
        const pendingCount = pendingReqs.length;

        // 1. Metric: Active Loans
        const metricActiveCount = document.getElementById('profile-metric-active-count');
        if (metricActiveCount) metricActiveCount.textContent = String(activeCount);

        const quotaPill = document.getElementById('profile-loans-quota-pill');
        if (quotaPill) quotaPill.textContent = `${activeCount} / ${MAX_LOAN_QUOTA} Slots`;

        const progressFill = document.getElementById('profile-loan-progress-fill');
        if (progressFill) {
            const pct = Math.min(100, Math.round((activeCount / MAX_LOAN_QUOTA) * 100));
            progressFill.style.width = `${pct}%`;
            progressFill.style.background = activeCount >= MAX_LOAN_QUOTA
                ? 'var(--neon-pink, #ff007a)'
                : 'linear-gradient(90deg, var(--neon-cyan, #00f0ff), #8b5cf6)';
        }

        // 2. Metric: Pending Requests
        const metricPendingCount = document.getElementById('profile-metric-pending-count');
        if (metricPendingCount) metricPendingCount.textContent = String(pendingCount);

        const pendingSub = document.getElementById('profile-pending-sub');
        if (pendingSub) {
            pendingSub.textContent = pendingCount === 0
                ? 'All manifests verified'
                : `${pendingCount} awaiting approval`;
        }

        // 3. Metric: Return History & Standing
        const metricHistory = document.getElementById('profile-metric-history-count');
        if (metricHistory) metricHistory.textContent = String(totalReturnedCount);

        const now = new Date();
        const hasOverdue = activeLoans.some(l => {
            if (!l.rec.dueDate) return false;
            const d = new Date(l.rec.dueDate);
            return !isNaN(d.getTime()) && d < now;
        });

        const metricStanding = document.getElementById('profile-metric-standing');
        if (metricStanding) {
            if (hasOverdue) {
                metricStanding.textContent = 'Action Required';
                metricStanding.className = 'metric-sub-note text-pink font-bold';
            } else {
                metricStanding.textContent = 'Clear Standing';
                metricStanding.className = 'metric-sub-note text-green';
            }
        }



        // Tab count badges
        const tabCountLoans = document.getElementById('profile-tab-count-loans');
        if (tabCountLoans) tabCountLoans.textContent = String(activeCount);

        const tabCountRequests = document.getElementById('profile-tab-count-requests');
        if (tabCountRequests) tabCountRequests.textContent = String(pendingCount);

        // Render Tab 1: Active Loans List
        const loansContainer = document.getElementById('profile-active-loans-list');
        if (loansContainer) {
            if (activeLoans.length === 0) {
                loansContainer.innerHTML = `
                    <div class="profile-empty-loans">
                        <div class="empty-icon-shield">
                            <i data-lucide="shield-check"></i>
                        </div>
                        <h4 class="empty-loans-title">All Hardware Returned & Clear</h4>
                        <p class="empty-loans-desc">You currently have no pending hardware checkouts. Your full borrowing allowance (${MAX_LOAN_QUOTA} slots) is ready for use.</p>
                        <button type="button" class="profile-browse-vault-btn" id="profile-browse-vault-btn">
                            <i data-lucide="layers"></i>
                            <span>Explore Inventory Vault</span>
                        </button>
                    </div>
                `;
                const browseBtn = document.getElementById('profile-browse-vault-btn');
                if (browseBtn) {
                    browseBtn.addEventListener('click', () => {
                        if ((window as any).switchSection) {
                            (window as any).switchSection('inventory-view');
                        }
                    });
                }
            } else {
                loansContainer.innerHTML = activeLoans.map(({ item, rec, origIdx }) => {
                    const isOverdue = rec.dueDate && new Date(rec.dueDate) < now;
                    const isReturnRequested = (rec as any).status === 'RETURN_REQUESTED';
                    const dueDateStr = rec.dueDate ? new Date(rec.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Due Date';
                    const borrowDateStr = rec.date ? new Date(rec.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
                    const qty = rec.qty || (rec as any).quantity || 1;

                    return `
                        <div class="profile-loan-card glass ${isOverdue ? 'loan-card-overdue' : ''}">
                            <div class="loan-card-top-row">
                                <div class="loan-card-cat-wrap">
                                    <span class="loan-cat-pill">${(item.category || 'COMPONENT').toUpperCase()}</span>
                                    ${isOverdue ? '<span class="loan-tag tag-overdue"><i data-lucide="alert-triangle"></i> OVERDUE</span>' : ''}
                                    ${isReturnRequested ? '<span class="loan-tag tag-pending"><i data-lucide="clock"></i> RETURN REQUESTED</span>' : '<span class="loan-tag tag-active"><i data-lucide="check-circle-2"></i> ACTIVE LOAN</span>'}
                                </div>
                                <span class="loan-qty-badge">${qty} ${qty === 1 ? 'Unit' : 'Units'}</span>
                            </div>

                            <div class="loan-card-info-row">
                                <div class="loan-icon-thumb">
                                    <i data-lucide="cpu"></i>
                                </div>
                                <div class="loan-details-wrap">
                                    <h4 class="loan-item-title">${item.name}</h4>
                                    <div class="loan-meta-pills">
                                        <span><i data-lucide="calendar"></i> Borrowed: ${borrowDateStr}</span>
                                        <span class="${isOverdue ? 'text-pink font-bold' : ''}"><i data-lucide="clock"></i> Due: ${dueDateStr}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="loan-card-action-bar">
                                <button type="button" class="profile-return-hw-btn ${isReturnRequested ? 'disabled' : ''}" 
                                    data-item-id="${item.id}" data-rec-idx="${origIdx}" ${isReturnRequested ? 'disabled' : ''}>
                                    <i data-lucide="${isReturnRequested ? 'clock' : 'corner-up-left'}"></i>
                                    <span>${isReturnRequested ? 'Return Pending Approval' : 'Return Component'}</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                const returnButtons = loansContainer.querySelectorAll('.profile-return-hw-btn');
                returnButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const itemId = (btn as HTMLElement).dataset.itemId;
                        const origIdx = parseInt((btn as HTMLElement).dataset.recIdx || '0', 10);
                        const targetItem = inventory.find(i => String(i.id) === String(itemId))
                            || activeLoans.find(l => String(l.item.id) === String(itemId))?.item;
                        const matchingLoan = targetItem?.borrowedBy?.[origIdx]
                            || targetItem?.borrowedBy?.find((b: any) => ModalManager.isUserLoanMatch(b))
                            || activeLoans.find(l => String(l.item.id) === String(itemId))?.rec;
                        if (targetItem && matchingLoan) {
                            ModalManager.openReturnModal(matchingLoan, targetItem, origIdx);
                        }
                    });
                });
            }
        }

        // Render Tab 2: Pending Requests List
        const requestsContainer = document.getElementById('profile-pending-requests-list');
        if (requestsContainer) {
            if (this.cachedRequests.length === 0) {
                requestsContainer.innerHTML = `
                    <div class="profile-empty-loans">
                        <div class="empty-icon-shield" style="background: rgba(189, 0, 255, 0.12); border-color: rgba(189, 0, 255, 0.3); color: var(--neon-purple);">
                            <i data-lucide="check-check"></i>
                        </div>
                        <h4 class="empty-loans-title">No Pending Requests</h4>
                        <p class="empty-loans-desc">You have no hardware checkout requests currently awaiting administrator review.</p>
                        <button type="button" class="profile-browse-vault-btn" id="profile-req-browse-btn">
                            <i data-lucide="shopping-bag"></i>
                            <span>Browse Vault & Request Hardware</span>
                        </button>
                    </div>
                `;
                document.getElementById('profile-req-browse-btn')?.addEventListener('click', () => {
                    if ((window as any).switchSection) (window as any).switchSection('inventory-view');
                });
            } else {
                requestsContainer.innerHTML = this.cachedRequests.map(req => {
                    const status = (req.status || 'PENDING').toUpperCase();
                    const statusClass = status === 'APPROVED' ? 'tag-active' : (status === 'REJECTED' ? 'tag-overdue' : 'tag-pending');
                    const reqDate = req.created_at ? new Date(req.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
                    const items = Array.isArray(req.items) ? req.items : (req.item ? [req.item] : []);

                    return `
                        <div class="profile-request-card">
                            <div class="profile-request-header">
                                <span class="profile-request-title"><i data-lucide="file-text" style="width:13px;height:13px;display:inline-block;vertical-align:middle;"></i> Request #${String(req.id).slice(0, 8)}</span>
                                <span class="loan-tag ${statusClass}">${status}</span>
                            </div>
                            <div style="font-size: 11.5px; color: #94a3b8; display:flex; gap: 12px; flex-wrap: wrap;">
                                <span><i data-lucide="calendar" style="width:11px;height:11px;display:inline-block;vertical-align:middle;"></i> ${reqDate}</span>
                                ${req.purpose ? `<span><i data-lucide="target" style="width:11px;height:11px;display:inline-block;vertical-align:middle;"></i> ${req.purpose}</span>` : ''}
                            </div>
                            ${items.length > 0 ? `
                                <div class="profile-request-items-list">
                                    ${items.map((it: any) => `
                                        <div class="profile-request-item-row">
                                            <span>${it.name || it.item_name || 'Component'}</span>
                                            <span style="color: var(--neon-cyan); font-weight:700;">x${it.quantity || it.qty || 1}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            }
        }

        // Render Tab 3: Return History List
        const historyContainer = document.getElementById('profile-return-history-list');
        if (historyContainer) {
            const returnedRecords = this.cachedHistory.filter(h => h.status === 'RETURNED' || h.returned_at);
            if (returnedRecords.length === 0) {
                historyContainer.innerHTML = `
                    <div class="profile-empty-loans">
                        <div class="empty-icon-shield">
                            <i data-lucide="history"></i>
                        </div>
                        <h4 class="empty-loans-title">No Return Records</h4>
                        <p class="empty-loans-desc">Completed return transactions and inspection logs will appear here.</p>
                    </div>
                `;
            } else {
                historyContainer.innerHTML = returnedRecords.map(rec => {
                    const retDate = rec.returned_at ? new Date(rec.returned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Verified';
                    const itemName = rec.inventory?.name || rec.item_name || rec.borrower_name || 'Lab Asset';
                    const qty = rec.quantity || rec.qty || 1;

                    return `
                        <div class="profile-loan-card">
                            <div class="loan-card-top-row">
                                <div class="loan-card-cat-wrap">
                                    <span class="loan-cat-pill">RETURNED</span>
                                    <span class="loan-tag tag-active"><i data-lucide="check"></i> VERIFIED BY ADMIN</span>
                                </div>
                                <span class="loan-qty-badge">${qty} ${qty === 1 ? 'Unit' : 'Units'}</span>
                            </div>
                            <div class="loan-card-info-row">
                                <div class="loan-icon-thumb" style="color: #10b981; border-color: rgba(16, 185, 129, 0.25); background: rgba(16, 185, 129, 0.1);">
                                    <i data-lucide="package-check"></i>
                                </div>
                                <div class="loan-details-wrap">
                                    <h4 class="loan-item-title">${itemName}</h4>
                                    <div class="loan-meta-pills">
                                        <span><i data-lucide="calendar"></i> Returned On: ${retDate}</span>
                                        <span><i data-lucide="shield-check"></i> Restocked to Vault</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Recreate Lucide icons for freshly injected HTML
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }
}

(window as any).ProfileViewManager = ProfileViewManager;

// ==========================================
// Profile Edit Manager System (Avatar & Details Sync)
// ==========================================
class ProfileEditManager {
    private static isInitialized = false;
    private static pendingAvatarUrl: string | null | undefined = undefined;

    public static init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        const modal = document.getElementById('edit-profile-modal');
        const closeBtn = document.getElementById('close-edit-profile-modal');
        const cancelBtn = document.getElementById('cancel-edit-profile-btn');
        const form = document.getElementById('edit-profile-form') as HTMLFormElement;
        const fileInput = document.getElementById('edit-avatar-file-input') as HTMLInputElement;
        const resetAvatarBtn = document.getElementById('edit-avatar-remove-btn');
        const modalSecurityBtn = document.getElementById('edit-profile-security-btn');

        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

        if (modalSecurityBtn) {
            modalSecurityBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.close();
                if (typeof PasswordResetManager !== 'undefined' && typeof PasswordResetManager.open === 'function') {
                    PasswordResetManager.open();
                } else if ((window as any).openPasswordResetModal) {
                    (window as any).openPasswordResetModal();
                } else {
                    const resetModal = document.getElementById('reset-password-modal');
                    if (resetModal) resetModal.classList.add('active');
                }
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (!files || files.length === 0) return;
                const file = files[0];

                if (!file.type.startsWith('image/')) {
                    ToastManager.show('Invalid Format', 'Please choose a PNG, JPG, or WEBP image file.', 'warning');
                    return;
                }

                if (file.size > 8 * 1024 * 1024) {
                    ToastManager.show('File Too Large', 'Please select an image smaller than 8MB.', 'warning');
                    return;
                }

                try {
                    const compressedBase64 = await this.compressAndCropAvatar(file);
                    this.pendingAvatarUrl = compressedBase64;
                    this.updatePreview(compressedBase64);
                } catch (err: any) {
                    ToastManager.show('Image Processing Error', 'Could not process selected image.', 'error');
                }
            });
        }

        if (resetAvatarBtn) {
            resetAvatarBtn.addEventListener('click', () => {
                this.pendingAvatarUrl = '';
                this.updatePreview('');
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveProfile();
            });
        }
    }

    private static updatePreview(avatarUrl: string | null | undefined) {
        const previewImg = document.getElementById('edit-avatar-img-preview') as HTMLImageElement;
        const previewInitial = document.getElementById('edit-avatar-initial-preview');
        const nameInput = document.getElementById('edit-profile-name') as HTMLInputElement;
        const char = (nameInput?.value || 'U').charAt(0).toUpperCase();

        if (previewImg && previewInitial) {
            if (avatarUrl) {
                previewImg.src = avatarUrl;
                previewImg.style.display = 'block';
                previewInitial.style.display = 'none';
            } else {
                previewImg.style.display = 'none';
                previewInitial.textContent = char;
                previewInitial.style.display = 'flex';
            }
        }
    }

    private static compressAndCropAvatar(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = 256;
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Canvas context not available'));
                        return;
                    }

                    // Crop to center square
                    const minDim = Math.min(img.width, img.height);
                    const startX = (img.width - minDim) / 2;
                    const startY = (img.height - minDim) / 2;

                    ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);

                    try {
                        const dataUrl = canvas.toDataURL('image/webp', 0.86);
                        if (dataUrl && dataUrl.startsWith('data:image/webp')) {
                            resolve(dataUrl);
                            return;
                        }
                    } catch { }

                    resolve(canvas.toDataURL('image/jpeg', 0.86));
                };
                img.onerror = reject;
                img.src = readerEvent.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    public static open() {
        this.init();

        let user: any = {};
        try {
            user = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        } catch {
            user = {};
        }

        const nameInput = document.getElementById('edit-profile-name') as HTMLInputElement;
        const usernameInput = document.getElementById('edit-profile-username') as HTMLInputElement;
        const branchInput = document.getElementById('edit-profile-branch') as HTMLInputElement;
        const emailInput = document.getElementById('edit-profile-email') as HTMLInputElement;
        const rollInput = document.getElementById('edit-profile-roll') as HTMLInputElement;
        const errorEl = document.getElementById('edit-profile-error');

        const authName = localStorage.getItem('cicr_auth') || '';
        const name = (user.name || user.username || authName || '').trim();
        const username = (user.username || (authName ? authName.toLowerCase() : '')).trim();
        const roll = (user.roll_number || user.roll || '').trim();
        const email = (user.email || (roll ? `${roll}@mail.jiit.ac.in` : '')).trim();
        const branch = getStudentBranch(roll, user.branch || user.batch);

        if (nameInput) nameInput.value = name;
        if (usernameInput) usernameInput.value = username;
        if (branchInput) branchInput.value = branch;
        if (emailInput) {
            emailInput.value = email || (roll ? `${roll}@mail.jiit.ac.in` : '');
            emailInput.readOnly = true;
            emailInput.disabled = true;
        }
        if (rollInput) {
            rollInput.value = roll || 'Enrolled Student';
            rollInput.readOnly = true;
            rollInput.disabled = true;
        }

        this.pendingAvatarUrl = user.avatar_url;
        this.updatePreview(user.avatar_url);

        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
        }

        const modal = document.getElementById('edit-profile-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    public static close() {
        const modal = document.getElementById('edit-profile-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        this.pendingAvatarUrl = undefined;
    }

    private static async saveProfile() {
        const nameInput = document.getElementById('edit-profile-name') as HTMLInputElement;
        const usernameInput = document.getElementById('edit-profile-username') as HTMLInputElement;
        const branchInput = document.getElementById('edit-profile-branch') as HTMLInputElement;
        const saveBtn = document.getElementById('save-edit-profile-btn') as HTMLButtonElement;
        const errorEl = document.getElementById('edit-profile-error');

        const newName = nameInput ? nameInput.value.trim() : '';
        const newUsername = usernameInput ? usernameInput.value.trim() : '';
        const newBranch = branchInput ? branchInput.value.trim() : '';

        if (!newName) {
            if (errorEl) {
                errorEl.textContent = 'Full name is required.';
                errorEl.style.display = 'block';
            }
            return;
        }

        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
        }

        const origBtnHtml = saveBtn ? saveBtn.innerHTML : 'Save & Sync';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> <span>Syncing...</span>';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }

        let user: any = {};
        try {
            user = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        } catch { }

        const token = localStorage.getItem('cicr_token') || '';
        const payload: any = {
            name: newName,
            username: newUsername || undefined,
            branch: newBranch || undefined,
            batch: newBranch || undefined
        };

        if (this.pendingAvatarUrl !== undefined) {
            payload.avatar_url = this.pendingAvatarUrl || null;
        }

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            let cloudSync = false;
            let updatedUser: any = null;

            try {
                const res = await fetch(`${API_BASE}/auth/profile`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(payload)
                });

                const data = await res.json().catch(() => ({}));

                if (res.ok) {
                    cloudSync = true;
                    updatedUser = data.data;
                } else {
                    console.warn('Backend profile update note:', data.message);
                }
            } catch (netErr) {
                console.warn('Backend unreachable, saving profile locally:', netErr);
            }

            if (!updatedUser) {
                updatedUser = {
                    ...user,
                    name: newName,
                    username: newUsername || user.username,
                    branch: newBranch || user.branch,
                    batch: newBranch || user.batch,
                    avatar_url: this.pendingAvatarUrl !== undefined ? (this.pendingAvatarUrl || null) : user.avatar_url
                };
            }

            // Update local storage
            localStorage.setItem('cicr_user', JSON.stringify(updatedUser));
            if (updatedUser.username) {
                localStorage.setItem('cicr_auth', updatedUser.username);
            }

            // Sync with other active UI components
            const navUserName = document.getElementById('nav-user-name');
            if (navUserName) navUserName.textContent = updatedUser.name || updatedUser.username;

            const profileUserDisplay = document.getElementById('profile-username-display');
            if (profileUserDisplay) profileUserDisplay.textContent = updatedUser.username || updatedUser.name;

            // Update avatar in sidebar & profile view
            ProfileViewManager.render();

            if (cloudSync) {
                ToastManager.show('Profile Synchronized', 'Your identity and profile picture are securely synced with cloud vault.', 'success');
            } else {
                ToastManager.show('Profile Saved', 'Profile details updated. Local cache saved.', 'success');
            }
            this.close();
        } catch (err: any) {
            console.error('Save profile error:', err);
            if (errorEl) {
                errorEl.textContent = err.message || 'Error synchronizing with backend.';
                errorEl.style.display = 'block';
            }
            ToastManager.show('Update Failed', err.message || 'Could not update profile.', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = origBtnHtml;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            }
        }
    }
}

(window as any).ProfileEditManager = ProfileEditManager;
(window as any).openProfileEditModal = () => ProfileEditManager.open();
(window as any).closeProfileEditModal = () => ProfileEditManager.close();

// ==========================================
// ==========================================
// Hardware Ledger & Activity Logs Manager
// ==========================================
interface LedgerEntry {
    id: string;
    component_id: string | number;
    component_name: string;
    category: string;
    borrower_name: string;
    borrower_email: string;
    borrower_roll: string;
    admin_approved_by: string;
    operator_name?: string;
    action_type: 'ISSUED' | 'RETURNED' | 'PENDING_APPROVAL';
    quantity: number;
    date: string;
    due_date?: string | null;
    return_date?: string | null;
    purpose: string;
    remarks?: string | null;
    status: string;
}

class HardwareLedgerManager {
    private static isInitialized = false;
    private static records: LedgerEntry[] = [];
    private static activeFilter: 'all' | 'borrowed' | 'returned' | 'requests' = 'all';
    private static searchQuery = '';
    private static isLoading = false;

    public static getRecords(): LedgerEntry[] {
        return this.records;
    }

    public static init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // Filter tabs
        const filterBtns = document.querySelectorAll('.hw-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeFilter = ((btn as HTMLElement).dataset.filter as any) || 'all';
                this.renderTable();
            });
        });

        // Search bar
        const searchInput = document.getElementById('hw-ledger-search') as HTMLInputElement;
        if (searchInput) {
            let searchTimeout: number | undefined;
            searchInput.addEventListener('input', () => {
                if (searchTimeout) clearTimeout(searchTimeout);
                searchTimeout = window.setTimeout(() => {
                    this.searchQuery = (searchInput.value || '').toLowerCase().trim();
                    this.renderTable();
                }, 150);
            });
        }

        // Sync / Refresh button
        const refreshBtn = document.getElementById('hw-ledger-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.classList.add('spinning');
                await this.fetchLedger(true);
                this.renderTable();
                setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
            });
        }

        // Realtime sync: periodic background polling when ledger view is open & on window focus
        if (!HardwareLedgerManager.pollTimer) {
            HardwareLedgerManager.pollTimer = window.setInterval(() => {
                const view = document.getElementById('hardware-logs-view');
                if (view && view.style.display !== 'none' && !document.hidden) {
                    HardwareLedgerManager.fetchLedger(true).then(() => HardwareLedgerManager.renderTable());
                }
            }, 12000);

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    const view = document.getElementById('hardware-logs-view');
                    if (view && view.style.display !== 'none') {
                        HardwareLedgerManager.fetchLedger(true).then(() => HardwareLedgerManager.renderTable());
                    }
                }
            });
        }

        // Delete modal triggers
        const cancelDeleteBtn = document.getElementById('btn-cancel-delete-ledger');
        const closeDeleteX = document.getElementById('btn-close-delete-ledger-x');
        const confirmDeleteBtn = document.getElementById('btn-confirm-delete-ledger');

        if (cancelDeleteBtn) cancelDeleteBtn.onclick = () => {
            const m = document.getElementById('delete-ledger-confirm-modal');
            if (m) m.style.display = 'none';
        };
        if (closeDeleteX) closeDeleteX.onclick = () => {
            const m = document.getElementById('delete-ledger-confirm-modal');
            if (m) m.style.display = 'none';
        };
        if (confirmDeleteBtn) confirmDeleteBtn.onclick = () => {
            HardwareLedgerManager.confirmDeleteRecord();
        };

        const tbodyEl = document.getElementById('hw-ledger-table-body');
        if (tbodyEl) {
            tbodyEl.addEventListener('click', (e) => {
                const delBtn = (e.target as HTMLElement).closest('.hw-btn-delete-log') as HTMLElement | null;
                if (delBtn && delBtn.dataset.logId) {
                    e.preventDefault();
                    e.stopPropagation();
                    HardwareLedgerManager.promptDeleteRecord(delBtn.dataset.logId);
                    return;
                }

                const retBtn = (e.target as HTMLElement).closest('.btn-ledger-return-action') as HTMLElement | null;
                if (retBtn && retBtn.dataset.borrowId) {
                    e.preventDefault();
                    e.stopPropagation();
                    HardwareLedgerManager.triggerReturn(retBtn.dataset.borrowId, retBtn.dataset.compId, retBtn.dataset.compName);
                    return;
                }
            });
        }
    }

    private static pollTimer: number | null = null;

    private static parseDateSafe(d: any): Date | null {
        if (!d) return null;
        if (d instanceof Date && !isNaN(d.getTime())) return d;
        if (typeof d === 'string') {
            const trimmed = d.trim();
            if (!trimmed || trimmed.toLowerCase().includes('day') || trimmed === '—' || trimmed.toLowerCase().includes('open')) return null;
            const parsed = new Date(trimmed);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        if (typeof d === 'number') {
            const parsed = new Date(d);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        return null;
    }

    public static async render() {
        this.init();
        await this.fetchLedger(true);
        this.renderTable();
    }

    public static async fetchLedger(force = false) {
        if (this.isLoading) return;
        if (this.records.length > 0 && !force) {
            return;
        }

        this.isLoading = true;
        try {
            const token = localStorage.getItem('cicr_token');
            let fetchedData: LedgerEntry[] = [];

            try {
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(`${API_BASE}/borrow/ledger?force=true&t=${Date.now()}`, { headers });
                if (res.ok) {
                    const json = await res.json();
                    if (Array.isArray(json.data)) {
                        fetchedData = json.data;
                    }
                }
            } catch (err) {
                console.warn('Backend /borrow/ledger unreachable, aggregating from inventory...', err);
            }

            // Fallback / merge with local inventory records
            const localRecords: LedgerEntry[] = [];
            if (Array.isArray(inventory)) {
                inventory.forEach(item => {
                    (item.borrowedBy || []).forEach((b: any, idx: number) => {
                        const isReturned = b.returned || b.status === 'RETURNED';
                        const borrower = b.userName || b.borrowerName || b.name || 'Student Borrower';
                        let adminApprover = b.adminApprovedBy || b.approvedBy || b.reviewedBy || '';
                        if (adminApprover && adminApprover.includes('SRVKILLER09')) {
                            adminApprover = '';
                        }
                        if (!adminApprover || adminApprover === 'Admin Team' || adminApprover === 'ADMIN' || adminApprover === 'Admin') {
                            adminApprover = 'Lab Administrator';
                        } else {
                            adminApprover = adminApprover.replace(/\s*\([Aa]dmin\)/gi, '').trim();
                        }
                        localRecords.push({
                            id: b.id || `local-${item.id}-${idx}`,
                            component_id: item.id,
                            component_name: item.name,
                            category: item.category || 'Component',
                            borrower_name: borrower,
                            borrower_email: b.userEmail || b.email || (b.userRoll ? `${b.userRoll}@mail.jiit.ac.in` : ''),
                            borrower_roll: b.userRoll || b.roll || (b.userEmail ? b.userEmail.split('@')[0] : '—'),
                            admin_approved_by: adminApprover,
                            operator_name: adminApprover,
                            action_type: isReturned ? 'RETURNED' : 'ISSUED',
                            quantity: Number(b.qty) || Number(b.quantity) || 1,
                            date: b.date || null,
                            due_date: b.dueDate || null,
                            return_date: b.returnDate || (isReturned ? (b.date || null) : null),
                            purpose: b.purpose || b.reason || 'Hardware Prototyping & Research',
                            remarks: b.remarks || b.note || null,
                            status: isReturned ? 'RETURNED' : (b.status || 'APPROVED')
                        });
                    });
                });
            }

            // Collect pending approval requests from local state and backend
            const pendingRequestRecords: LedgerEntry[] = [];
            let localReqs: any[] = [];
            try {
                const raw = localStorage.getItem('cicr_requests');
                if (raw) localReqs = JSON.parse(raw);
            } catch {}

            const combinedReqs = [...(requests || []), ...localReqs];
            const seenReqIds = new Set<string>();
            combinedReqs.forEach((r: any) => {
                if (!r || !r.id || seenReqIds.has(String(r.id))) return;
                seenReqIds.add(String(r.id));
                const status = (r.status || 'PENDING').toUpperCase();
                if (status === 'PENDING') {
                    pendingRequestRecords.push({
                        id: `req-${r.id}`,
                        component_id: r.itemId || '',
                        component_name: r.itemName || 'Hardware Component',
                        category: r.category || 'Component',
                        borrower_name: r.name || r.borrowerName || 'Student Borrower',
                        borrower_email: r.email || r.borrowerEmail || (r.roll ? `${r.roll}@mail.jiit.ac.in` : ''),
                        borrower_roll: r.roll || r.rollNumber || '—',
                        admin_approved_by: 'Awaiting Admin Review',
                        operator_name: 'Awaiting Admin Review',
                        action_type: 'PENDING_APPROVAL',
                        quantity: Number(r.qty || r.quantity) || 1,
                        date: r.requestedAt || r.date || null,
                        due_date: r.dueDate || '7 Days',
                        return_date: null,
                        purpose: r.purpose || 'Academic Project Research',
                        remarks: 'Pending Administrator Approval',
                        status: 'PENDING'
                    });
                }
            });

            // Merge and deduplicate with rigorous normalization
            const mergedMap = new Map<string, LedgerEntry>();
            fetchedData.forEach((r: any) => {
                const isReturned = r.status === 'RETURNED' || Boolean(r.returned_at);
                const isPending = r.status === 'PENDING' || r.action_type === 'PENDING_APPROVAL';
                const borrower = r.borrower_name || r.users?.name || r.userName || 'Student Borrower';
                const roll = r.borrower_roll || r.roll_number || r.users?.roll_number || (r.borrower_email ? r.borrower_email.split('@')[0] : '—');
                const email = r.borrower_email || r.users?.email || (roll && roll !== '—' ? `${roll}@mail.jiit.ac.in` : '');
                let adminApprover = r.admin_approved_by || r.reviewed_by || r.adminName || r.operator_name || '';
                if (adminApprover && adminApprover.includes('SRVKILLER09')) {
                    adminApprover = '';
                }

                // Cross-reference with AdminManager requests if reviewer recorded
                if (!adminApprover || adminApprover === 'Admin Team' || adminApprover === 'ADMIN') {
                    const matchedReq = (AdminManager.hardwareRequests || []).find((x: any) => x.id === r.id || x.borrowId === r.id || (x.itemId === (r.inventory_id || r.component_id) && (x.borrowerName === borrower || x.borrowerEmail === email)));
                    if (matchedReq && matchedReq.reviewedBy && matchedReq.reviewedBy !== 'ADMIN' && matchedReq.reviewedBy !== 'User') {
                        adminApprover = matchedReq.reviewedBy;
                    }
                }

                if (!adminApprover || adminApprover === 'Admin Team' || adminApprover === 'ADMIN' || adminApprover === 'Admin') {
                    adminApprover = isPending ? 'Awaiting Admin Review' : 'Lab Administrator';
                } else {
                    adminApprover = adminApprover.replace(/\s*\([Aa]dmin\)/gi, '').trim();
                }
                const normalized: LedgerEntry = {
                    id: String(r.id),
                    component_id: r.inventory_id || r.component_id || (r.inventory?.id) || '',
                    component_name: r.component_name || r.inventory?.name || r.itemName || 'Hardware Component',
                    category: r.category || r.inventory?.category || 'Component',
                    borrower_name: borrower,
                    borrower_email: email,
                    borrower_roll: roll,
                    admin_approved_by: adminApprover,
                    operator_name: adminApprover,
                    action_type: isPending ? 'PENDING_APPROVAL' : (isReturned ? 'RETURNED' : 'ISSUED'),
                    quantity: Number(r.quantity) || 1,
                    date: r.date || r.borrowed_at || r.created_at || null,
                    due_date: r.due_date || r.dueDate || null,
                    return_date: r.return_date || r.returned_at || (isReturned ? (r.borrowed_at || null) : null),
                    purpose: r.purpose || 'Academic Research',
                    remarks: r.remarks || null,
                    status: isPending ? 'PENDING' : (isReturned ? 'RETURNED' : (r.status || 'BORROWED'))
                };
                mergedMap.set(String(r.id), normalized);
            });

            localRecords.forEach(r => {
                if (!mergedMap.has(String(r.id))) {
                    mergedMap.set(String(r.id), r);
                }
            });

            pendingRequestRecords.forEach(r => {
                if (!mergedMap.has(String(r.id))) {
                    mergedMap.set(String(r.id), r);
                }
            });

            let allRecords = Array.from(mergedMap.values());

            // Personalization: If not admin, only show records belonging to the current user
            const currentRole = ModalManager.getCurrentRole();
            const isAdmin = currentRole === 'ADMIN';

            if (!isAdmin) {
                let currentUser: any = {};
                try { currentUser = JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch {}
                const authName = localStorage.getItem('cicr_auth') || '';
                const myEmail = (currentUser.email || '').toLowerCase().trim();
                const myRoll = (currentUser.roll_number || currentUser.roll || '').toLowerCase().trim();
                const myName = (currentUser.name || currentUser.username || authName || '').toLowerCase().trim();

                const isGeneric = (n: string) => !n || ['member', 'student', 'user', 'admin', 'borrower', 'guest', 'student borrower'].includes(n) || n.length < 3;
                allRecords = allRecords.filter(r => {
                    const bEmail = (r.borrower_email || '').toLowerCase().trim();
                    const bRoll = (r.borrower_roll || '').toLowerCase().trim();
                    const bName = (r.borrower_name || '').toLowerCase().trim();

                    return (myEmail && bEmail === myEmail) ||
                           (myRoll && bRoll === myRoll) ||
                           (!isGeneric(myName) && !isGeneric(bName) && bName === myName);
                });
            }

            // Update banner dynamic titles
            const tagEl = document.getElementById('hw-ledger-banner-tag');
            const titleEl = document.getElementById('hw-ledger-banner-title');
            const descEl = document.getElementById('hw-ledger-banner-desc');
            if (tagEl) tagEl.textContent = isAdmin ? 'ADMIN AUDIT REGISTRY' : 'MY ACTIVITY LOGS';
            if (titleEl) titleEl.textContent = isAdmin ? 'Component Issue & Return Ledger' : 'My Logs & Issue History';
            if (descEl) descEl.textContent = isAdmin 
                ? 'Official administrative registry tracking component checkouts, verified borrower credentials, authorizing administrator, timestamps, and return verification.'
                : 'Review your pending component approval requests, active checkouts, and return verification history.';

            this.records = allRecords.sort((a, b) => {
                const timeA = a.date ? new Date(a.date).getTime() : 0;
                const timeB = b.date ? new Date(b.date).getTime() : 0;
                return timeB - timeA;
            });
        } finally {
            this.isLoading = false;
        }
    }

    public static renderTable() {
        // Update stats
        const totalLogs = this.records.length;
        const pendingRequests = this.records.filter(r => r.action_type === 'PENDING_APPROVAL' || r.status === 'PENDING').length;
        const activeIssued = this.records.filter(r => (r.action_type === 'ISSUED' || r.status === 'APPROVED' || r.status === 'BORROWED') && !r.return_date && r.status !== 'RETURNED').length;
        const totalReturned = this.records.filter(r => r.action_type === 'RETURNED' || Boolean(r.return_date) || r.status === 'RETURNED').length;

        const statTotal = document.getElementById('hw-stat-total-logs');
        const statPending = document.getElementById('hw-stat-pending-requests');
        const statActive = document.getElementById('hw-stat-active-issued');
        const statReturned = document.getElementById('hw-stat-total-returned');
        if (statTotal) statTotal.textContent = String(totalLogs);
        if (statPending) statPending.textContent = String(pendingRequests);
        if (statActive) statActive.textContent = String(activeIssued);
        if (statReturned) statReturned.textContent = String(totalReturned);

        // Filter
        const query = this.searchQuery;
        const filter = this.activeFilter;

        const filtered = this.records.filter(r => {
            const isRet = r.action_type === 'RETURNED' || Boolean(r.return_date) || r.status === 'RETURNED';
            const isPend = r.action_type === 'PENDING_APPROVAL' || r.status === 'PENDING';
            const isIss = (r.action_type === 'ISSUED' || r.status === 'APPROVED' || r.status === 'BORROWED') && !isRet && !isPend;

            if (filter === 'requests' && !isPend) return false;
            if (filter === 'borrowed' && !isIss) return false;
            if (filter === 'returned' && !isRet) return false;

            if (query) {
                const searchStr = `${r.component_name} ${r.category} ${r.borrower_name} ${r.borrower_roll} ${r.borrower_email} ${r.admin_approved_by} ${r.purpose} ${r.action_type} ${r.status}`.toLowerCase();
                if (!searchStr.includes(query)) return false;
            }

            return true;
        });

        const tbody = document.getElementById('hw-ledger-table-body');
        const countLabel = document.getElementById('hw-table-count-label');

        if (countLabel) {
            countLabel.textContent = `Showing ${filtered.length} log ${filtered.length === 1 ? 'entry' : 'entries'}${query ? ` matching "${query}"` : ''}`;
        }

        if (!tbody) return;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="hw-ledger-empty-cell">
                        <div class="hw-empty-state">
                            <i data-lucide="clipboard-x"></i>
                            <h4>No Activity Logs Found</h4>
                            <p>${query ? `No records match "${AdminManager.escapeHtml(query)}". Try a different search.` : 'There are currently no transactions or approval requests recorded for this filter.'}</p>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        const now = new Date();
        const isAdmin = ModalManager.getCurrentRole() === 'ADMIN';

        tbody.innerHTML = filtered.map(r => {
            const isPending = r.action_type === 'PENDING_APPROVAL' || r.status === 'PENDING';
            const isReturned = !isPending && (r.action_type === 'RETURNED' || Boolean(r.return_date) || r.status === 'RETURNED');
            
            const rawDate = this.parseDateSafe(r.date);
            const dateStr = rawDate
                ? rawDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';

            const rawDueDate = this.parseDateSafe(r.due_date);
            const isOverdue = !isReturned && !isPending && rawDueDate && rawDueDate < now;
            const dueDateStr = rawDueDate
                ? rawDueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : (typeof r.due_date === 'string' && r.due_date.trim() ? r.due_date.trim() : 'Open Loan');

            const rawReturnDate = this.parseDateSafe(r.return_date);
            const returnDateStr = rawReturnDate
                ? `${rawReturnDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${rawReturnDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()}`
                : 'Verified Return';

            const catMap: Record<string, string> = {
                microcontrollers: "MCU",
                sensors: "SENSOR",
                actuators: "ACTUATOR",
                power: "POWER",
                tools: "HARDWARE"
            };
            const catLabel = catMap[r.category?.toLowerCase()] || (r.category || 'COMPONENT').toUpperCase();

            let actionBadge = '';
            let statusCell = '';
            let actionCell = '';

            if (isPending) {
                actionBadge = `<span class="hw-badge-event badge-pending-pill"><i data-lucide="clock"></i> REQUESTED</span>`;
                statusCell = `<div class="hw-due-log text-pink"><i data-lucide="hourglass"></i> <span>Awaiting Admin Review</span></div>`;
                actionCell = `<span class="badge-in-review-pill"><i data-lucide="loader"></i> In Review</span>`;
            } else if (isReturned) {
                actionBadge = `<span class="hw-badge-event badge-returned"><i data-lucide="check-circle-2"></i> RETURNED</span>`;
                statusCell = `<div class="hw-return-log text-green"><i data-lucide="shield-check"></i> <span>Returned: ${returnDateStr}</span></div>`;
                actionCell = isAdmin
                    ? `<button type="button" class="hw-btn-delete-log" data-log-id="${r.id}" title="Permanently Delete Record (Admin Only)"><i data-lucide="trash-2"></i></button>`
                    : `<span class="badge-completed-pill"><i data-lucide="check-check"></i> Completed</span>`;
            } else {
                actionBadge = `<span class="hw-badge-event badge-issued"><i data-lucide="arrow-down-right"></i> ISSUED</span>`;
                statusCell = `<div class="hw-due-log"><span class="${isOverdue ? 'text-pink font-bold' : 'text-cyan'}"><i data-lucide="clock"></i> Due: ${dueDateStr}</span>${isOverdue ? '<span class="badge-overdue-pill"><i data-lucide="alert-triangle"></i> OVERDUE</span>' : ''}</div>`;
                actionCell = isAdmin
                    ? `<button type="button" class="hw-btn-delete-log" data-log-id="${r.id}" title="Permanently Delete Record (Admin Only)"><i data-lucide="trash-2"></i></button>`
                    : `<button type="button" class="btn-ledger-return-action" data-borrow-id="${r.id}" data-comp-id="${r.component_id}" data-comp-name="${AdminManager.escapeHtml(r.component_name)}" title="Initiate Component Return"><i data-lucide="corner-down-left"></i> <span>Return</span></button>`;
            }

            const rawApprover = r.admin_approved_by || (isPending ? 'Awaiting Admin Review' : 'Lab Administrator');
            const approverName = rawApprover.replace(/\s*\([Aa]dmin\)/gi, '').trim();

            return `
                <tr class="hw-ledger-row ${isOverdue ? 'row-overdue' : ''}">
                    <!-- Component -->
                    <td>
                        <div class="hw-td-component">
                            <span class="hw-item-name" title="${AdminManager.escapeHtml(r.component_name)}">${AdminManager.escapeHtml(r.component_name)}</span>
                            <span class="hw-cat-pill cat-${(r.category || '').toLowerCase()}">${catLabel}</span>
                        </div>
                    </td>

                    <!-- Borrower -->
                    <td>
                        <div class="hw-td-borrower">
                            <a href="#" class="admin-user-clickable hw-borrower-name" data-user-name="${AdminManager.escapeHtml(r.borrower_name)}" data-user-email="${AdminManager.escapeHtml(r.borrower_email)}" data-user-roll="${AdminManager.escapeHtml(r.borrower_roll)}" title="Inspect Member Profile">${AdminManager.escapeHtml(r.borrower_name)}</a>
                            <span class="hw-roll-badge">${AdminManager.escapeHtml(r.borrower_roll || 'JIIT')}</span>
                        </div>
                    </td>

                    <!-- Approved By -->
                    <td>
                        <div class="hw-td-admin">
                            <div class="hw-admin-badge-pill">
                                <i data-lucide="${isPending ? 'clock' : 'shield-check'}"></i>
                                <span class="hw-admin-name">${AdminManager.escapeHtml(approverName)}</span>
                            </div>
                        </div>
                    </td>

                    <!-- Event Type -->
                    <td>
                        ${actionBadge}
                    </td>

                    <!-- Quantity -->
                    <td>
                        <span class="hw-qty-pill">${r.quantity} unit${r.quantity > 1 ? 's' : ''}</span>
                    </td>

                    <!-- Date -->
                    <td>
                        <span class="hw-date-val"><i data-lucide="calendar"></i> ${dateStr}</span>
                    </td>

                    <!-- Purpose / Reason -->
                    <td>
                        <div class="hw-purpose-cell" title="${AdminManager.escapeHtml(r.purpose)}">
                            <span class="hw-purpose-text">${AdminManager.escapeHtml(r.purpose || 'Academic Project')}</span>
                        </div>
                    </td>

                    <!-- Status / Return Log -->
                    <td>
                        ${statusCell}
                    </td>

                    <!-- Action -->
                    <td>
                        ${actionCell}
                    </td>
                </tr>
            `;
        }).join('');

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    public static triggerReturn(borrowId: string, compId?: string, compName?: string) {
        if (!borrowId) return;

        // Try to find the item and loan in inventory
        let targetItem: InventoryItem | undefined;
        let targetLoan: BorrowRecord | undefined;
        let targetIdx = 0;

        if (Array.isArray(inventory)) {
            for (const item of inventory) {
                if (compId && String(item.id) === String(compId)) {
                    targetItem = item;
                }
                const idx = (item.borrowedBy || []).findIndex((b: any) => String(b.id) === String(borrowId));
                if (idx !== -1) {
                    targetItem = item;
                    targetLoan = item.borrowedBy[idx];
                    targetIdx = idx;
                    break;
                }
            }
        }

        if (targetItem && targetLoan) {
            ModalManager.openReturnModal(targetLoan, targetItem, targetIdx);
            return;
        }

        // Synthesize item & loan if not found in local array
        let user: any = {};
        try { user = JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch {}
        const synthItem: any = targetItem || {
            id: compId || '1',
            name: compName || 'Hardware Component',
            borrowedBy: []
        };
        const synthLoan: BorrowRecord = {
            id: borrowId,
            name: user.name || 'Member',
            roll: user.roll_number || user.roll || '',
            email: user.email || '',
            qty: 1,
            date: new Date().toISOString(),
            purpose: 'Academic Project Research',
            status: 'BORROWED'
        };

        ModalManager.openReturnModal(synthLoan, synthItem, 0);
    }

    public static pendingDeleteId: string | null = null;

    public static promptDeleteRecord(id: string) {
        const record = this.records.find(r => r.id === id);
        if (!record) return;

        this.pendingDeleteId = id;
        const modal = document.getElementById('delete-ledger-confirm-modal');
        const summary = document.getElementById('delete-ledger-record-summary');
        if (summary) {
            summary.innerHTML = `
                <div><strong>Component:</strong> ${AdminManager.escapeHtml(record.component_name)} (${record.quantity} unit${record.quantity > 1 ? 's' : ''})</div>
                <div><strong>Borrower:</strong> ${AdminManager.escapeHtml(record.borrower_name)} (${AdminManager.escapeHtml(record.borrower_roll || '—')})</div>
                <div><strong>Status:</strong> ${record.action_type === 'RETURNED' || record.return_date ? 'Returned' : 'Issued / Active'}</div>
                <div><strong>Record ID:</strong> <code>${AdminManager.escapeHtml(record.id)}</code></div>
            `;
        }
        if (modal) {
            modal.style.display = 'flex';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    }

    public static async confirmDeleteRecord() {
        if (!this.pendingDeleteId) return;
        const id = this.pendingDeleteId;
        this.pendingDeleteId = null;

        const modal = document.getElementById('delete-ledger-confirm-modal');
        if (modal) modal.style.display = 'none';

        const token = localStorage.getItem('cicr_token');
        try {
            const res = await fetch(`${API_BASE}/borrow/ledger/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                this.records = this.records.filter(r => r.id !== id);
                this.renderTable();
                ToastManager.show('Ledger Record Purged', 'Record permanently removed from backend database.', 'success');
            } else {
                const json = await res.json().catch(() => ({}));
                ToastManager.show('Delete Failed', json.message || 'Could not delete ledger record.', 'error');
            }
        } catch (err: any) {
            ToastManager.show('Network Error', err.message || 'Server unreachable.', 'error');
        }
    }
}

(window as any).HardwareLedgerManager = HardwareLedgerManager;
(window as any).openHardwareLedger = () => {
    if (typeof (window as any).switchSection === 'function') {
        (window as any).switchSection('hardware-logs-view');
    }
};

// ==========================================
// Personalized Notification Center Manager
// ==========================================
class NotificationCenterManager {
    private static isInitialized = false;
    private static readIds: Set<string> = new Set();

    private static ensureReadIds(): Set<string> {
        if (!this.readIds) this.readIds = new Set();
        try {
            const stored = localStorage.getItem('cicr_read_notifs');
            if (stored) {
                const arr = JSON.parse(stored);
                if (Array.isArray(arr)) {
                    arr.forEach((id: string) => this.readIds.add(id));
                }
            }
        } catch {}
        return this.readIds;
    }

    public static init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        this.ensureReadIds();

        const notifBtn = document.getElementById('header-notif-btn');
        const dropdown = document.getElementById('header-notif-dropdown');
        const clearBtn = document.getElementById('btn-clear-notifs');
        const viewAllBtn = document.getElementById('btn-notif-view-all-logs');

        if (notifBtn && dropdown) {
            notifBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isOpen = dropdown.style.display !== 'none';
                if (isOpen) {
                    dropdown.style.display = 'none';
                    notifBtn.setAttribute('aria-expanded', 'false');
                } else {
                    dropdown.style.display = 'block';
                    notifBtn.setAttribute('aria-expanded', 'true');
                    this.renderDropdown();
                }
            });

            // Dismiss when clicking outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target as Node) && !notifBtn.contains(e.target as Node)) {
                    dropdown.style.display = 'none';
                    notifBtn.setAttribute('aria-expanded', 'false');
                }
            });

            // Dismiss when pressing Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && dropdown.style.display !== 'none') {
                    dropdown.style.display = 'none';
                    notifBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.markAllAsRead();
            });
        }

        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dropdown) dropdown.style.display = 'none';
                if (notifBtn) notifBtn.setAttribute('aria-expanded', 'false');
                if (typeof ModalManager !== 'undefined' && typeof ModalManager.openLogsDrawer === 'function') {
                    ModalManager.openLogsDrawer();
                } else {
                    const isAdmin = ModalManager.getCurrentRole() === 'ADMIN';
                    (window as any).switchSection?.(isAdmin ? 'hardware-logs-view' : 'profile-view');
                }
            });
        }

        this.updateNotifications();
    }

    public static getPersonalizedNotifications(): Array<{
        id: string;
        type: 'request' | 'issued' | 'returned' | 'due' | 'admin_alert';
        title: string;
        message: string;
        time: string;
        timestamp: number;
        unread: boolean;
        linkAction?: () => void;
    }> {
        this.ensureReadIds();
        const isAdmin = ModalManager.getCurrentRole() === 'ADMIN';
        const lastReadAllTime = Number(localStorage.getItem('cicr_last_read_all_time') || 0);
        const notifsCleared = localStorage.getItem('cicr_notifs_cleared') === 'true';

        const isUnread = (id: string, ts: number) => {
            if (this.readIds.has(id)) return false;
            if (id.startsWith('loan-') && this.readIds.has(id.replace('loan-', ''))) return false;
            if (id.startsWith('req-admin-') && this.readIds.has(id.replace('req-admin-', ''))) return false;
            if (id.startsWith('my-req-') && this.readIds.has(id.replace('my-req-', ''))) return false;
            if (notifsCleared) {
                if (lastReadAllTime > 0 && ts <= (lastReadAllTime + 86400000)) return false;
                if (!lastReadAllTime) return false;
            }
            if (lastReadAllTime > 0 && ts <= lastReadAllTime) return false;
            return true;
        };

        const notifs: Array<{
            id: string;
            type: 'request' | 'issued' | 'returned' | 'due' | 'admin_alert';
            title: string;
            message: string;
            time: string;
            timestamp: number;
            unread: boolean;
            linkAction?: () => void;
        }> = [];

        // 1. Pending / Active Requests
        let localRequests: any[] = [];
        try {
            const raw = localStorage.getItem('cicr_requests');
            if (raw) localRequests = JSON.parse(raw);
        } catch {}

        const adminQueue = (typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.hardwareRequests))
            ? AdminManager.hardwareRequests
            : [];
        const memberQueue = (typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.userHardwareRequests))
            ? AdminManager.userHardwareRequests
            : [];

        const combinedReqs = isAdmin
            ? [...adminQueue, ...(requests || []), ...localRequests]
            : [...memberQueue, ...(requests || []).filter(r => ModalManager.isUserRequestMatch(r)), ...localRequests.filter(r => ModalManager.isUserRequestMatch(r))];
        const seenReqIds = new Set<string>();

        if (isAdmin) {
            combinedReqs.forEach((req: any) => {
                if (!req || !req.id || seenReqIds.has(String(req.id))) return;
                seenReqIds.add(String(req.id));

                const reqTime = req.requestedAt ? Math.min(Date.now(), new Date(req.requestedAt).getTime()) : Date.now();
                const isReturn = req.type === 'RETURN' || Boolean(req.borrowId);
                const reqName = req.borrowerName || req.name || 'Member';
                const reqItem = req.itemName || 'Hardware Component';
                const reqQty = Number(req.quantity || req.qty || req.returnQuantity) || 1;

                if (req.status === 'PENDING') {
                    const notifId = `req-admin-${req.id}`;
                    notifs.push({
                        id: notifId,
                        type: 'admin_alert',
                        title: isReturn ? 'Hardware Return Pending' : 'New Hardware Request',
                        message: isReturn
                            ? `${reqName} submitted return for ${reqQty}x ${reqItem}`
                            : `${reqName} requested ${reqQty}x ${reqItem}`,
                        time: this.formatRelativeTime(reqTime),
                        timestamp: reqTime,
                        unread: isUnread(notifId, reqTime),
                        linkAction: () => {
                            if (typeof ModalManager !== 'undefined' && typeof ModalManager.openLogsDrawer === 'function') {
                                ModalManager.activeNotifTab = 'pending';
                                ModalManager.openLogsDrawer();
                            } else {
                                (window as any).switchSection?.('admin-view');
                            }
                        }
                    });
                } else if (req.status === 'APPROVED' && (Date.now() - reqTime < 48 * 60 * 60 * 1000)) {
                    const notifId = `req-admin-app-${req.id}`;
                    notifs.push({
                        id: notifId,
                        type: 'issued',
                        title: isReturn ? 'Return Accepted' : 'Hardware Request Approved',
                        message: `${reqName} - ${reqQty}x ${reqItem} (${isReturn ? 'Return Accepted' : 'Issued'})`,
                        time: this.formatRelativeTime(reqTime),
                        timestamp: reqTime,
                        unread: isUnread(notifId, reqTime),
                        linkAction: () => {
                            if (typeof ModalManager !== 'undefined' && typeof ModalManager.openLogsDrawer === 'function') {
                                ModalManager.activeNotifTab = 'approved';
                                ModalManager.openLogsDrawer();
                            }
                        }
                    });
                } else if (req.status === 'REJECTED' && (Date.now() - reqTime < 48 * 60 * 60 * 1000)) {
                    const notifId = `req-admin-rej-${req.id}`;
                    notifs.push({
                        id: notifId,
                        type: 'request',
                        title: 'Request Declined',
                        message: `${reqName} - ${reqItem} declined`,
                        time: this.formatRelativeTime(reqTime),
                        timestamp: reqTime,
                        unread: isUnread(notifId, reqTime),
                        linkAction: () => {
                            if (typeof ModalManager !== 'undefined' && typeof ModalManager.openLogsDrawer === 'function') {
                                ModalManager.activeNotifTab = 'rejected';
                                ModalManager.openLogsDrawer();
                            }
                        }
                    });
                }
            });
        } else {
            combinedReqs.forEach((req: any) => {
                if (!req || !req.id || seenReqIds.has(String(req.id))) return;
                seenReqIds.add(String(req.id));

                if (!ModalManager.isUserRequestMatch(req)) return;

                const reqTime = req.requestedAt ? Math.min(Date.now(), new Date(req.requestedAt).getTime()) : Date.now();
                const status = (req.status || 'PENDING').toUpperCase();
                const isReturn = req.type === 'RETURN' || Boolean(req.borrowId);
                const reqItem = req.itemName || 'Hardware Component';
                const reqQty = Number(req.quantity || req.qty || req.returnQuantity) || 1;
                const notifId = `my-req-${req.id}`;

                let title = 'Request In Review';
                let message = `Request for ${reqQty}x ${reqItem} is awaiting admin approval.`;
                let type: 'request' | 'issued' | 'returned' = 'request';

                if (status === 'APPROVED') {
                    type = isReturn ? 'returned' : 'issued';
                    title = isReturn ? 'Return Accepted' : 'Request Approved';
                    message = isReturn
                        ? `Your return of ${reqItem} (${reqQty}x) was accepted.`
                        : `Your request for ${reqItem} was approved and issued!`;
                } else if (status === 'REJECTED') {
                    type = 'request';
                    title = 'Request Declined';
                    message = `Your request for ${reqItem} was declined.`;
                } else {
                    title = isReturn ? 'Return Under Review' : 'Request In Review';
                    message = isReturn
                        ? `Return request for ${reqQty}x ${reqItem} is awaiting admin verification.`
                        : `Request for ${reqQty}x ${reqItem} is awaiting admin approval.`;
                }

                notifs.push({
                    id: notifId,
                    type,
                    title,
                    message,
                    time: this.formatRelativeTime(reqTime),
                    timestamp: reqTime,
                    unread: isUnread(notifId, reqTime),
                    linkAction: () => {
                        if (typeof ModalManager !== 'undefined' && typeof ModalManager.openLogsDrawer === 'function') {
                            ModalManager.activeNotifTab = status === 'APPROVED' ? 'approved' : (status === 'REJECTED' ? 'rejected' : 'pending');
                            ModalManager.openLogsDrawer();
                        } else {
                            (window as any).switchSection?.('profile-view');
                        }
                    }
                });
            });
        }

        // 2. Active Loans & Returns from inventory
        if (Array.isArray(inventory)) {
            const now = Date.now();
            inventory.forEach((item: any) => {
                (item.borrowedBy || []).forEach((b: any, idx: number) => {
                    const isMine = ModalManager.isUserLoanMatch(b);

                    if (isAdmin || isMine) {
                        const isReturned = b.returned || b.status === 'RETURNED';
                        const loanTime = b.date ? Math.min(Date.now(), new Date(b.date).getTime()) : Date.now();
                        const loanId = b.id || `${item.id}-${idx}`;

                        if (isReturned) {
                            // Non-admins only see their own returns.
                            // Admins see all returns from past 48 hours to avoid stale alerts from days ago
                            const isRecent = (now - loanTime) < (48 * 60 * 60 * 1000);
                            if (isMine || (isAdmin && isRecent)) {
                                const notifId = `ret-${loanId}`;
                                notifs.push({
                                    id: notifId,
                                    type: 'returned',
                                    title: isMine ? 'Return Verified' : 'Return Logged',
                                    message: isMine
                                        ? `${item.name} (${b.qty || 1} units) return has been verified.`
                                        : `${b.userName || b.borrowerName || b.name || 'Member'} returned ${item.name}`,
                                    time: this.formatRelativeTime(loanTime),
                                    timestamp: loanTime,
                                    unread: isUnread(notifId, loanTime),
                                    linkAction: () => {
                                        (window as any).switchSection?.(isAdmin ? 'hardware-logs-view' : 'profile-view');
                                    }
                                });
                            }
                        } else {
                            if (b.dueDate) {
                                const dueTime = new Date(b.dueDate).getTime();
                                if (!isNaN(dueTime)) {
                                    const diffHours = (dueTime - now) / (1000 * 60 * 60);
                                    if (diffHours < 48 && diffHours > 0) {
                                        const dueNotifId = `due-${loanId}`;
                                        notifs.push({
                                            id: dueNotifId,
                                            type: 'due',
                                            title: isMine ? 'Return Due Soon' : 'Component Due Soon',
                                            message: isMine
                                                ? `${item.name} is due within 48 hours (${new Date(b.dueDate).toLocaleDateString()}).`
                                                : `${item.name} loaned to ${b.userName || b.borrowerName || b.name || 'Member'} is due within 48 hours.`,
                                            time: 'Action Required',
                                            timestamp: dueTime,
                                            unread: isUnread(dueNotifId, dueTime),
                                            linkAction: () => {
                                                (window as any).switchSection?.(isAdmin ? 'hardware-logs-view' : 'profile-view');
                                            }
                                        });
                                    } else if (diffHours <= 0) {
                                        const overdueNotifId = `overdue-${loanId}`;
                                        notifs.push({
                                            id: overdueNotifId,
                                            type: 'due',
                                            title: 'Component Overdue',
                                            message: isMine
                                                ? `${item.name} is overdue! Please return to robotics lab.`
                                                : `${item.name} loaned to ${b.userName || b.borrowerName || b.name || 'Member'} is overdue!`,
                                            time: 'Overdue',
                                            timestamp: dueTime,
                                            unread: isUnread(overdueNotifId, dueTime),
                                            linkAction: () => {
                                                (window as any).switchSection?.(isAdmin ? 'hardware-logs-view' : 'profile-view');
                                            }
                                        });
                                    }
                                }
                            }

                            const isRecentLoan = (now - loanTime) < (48 * 60 * 60 * 1000);
                            if (isMine || (isAdmin && isRecentLoan)) {
                                const loanNotifId = `loan-${loanId}`;
                                notifs.push({
                                    id: loanNotifId,
                                    type: 'issued',
                                    title: isMine ? 'Component Issued' : 'Loan Recorded',
                                    message: isMine
                                        ? `${item.name} (${b.qty || 1} units) issued to you.`
                                        : `${item.name} issued to ${b.userName || b.borrowerName || b.name || 'Member'}`,
                                    time: this.formatRelativeTime(loanTime),
                                    timestamp: loanTime,
                                    unread: isUnread(loanNotifId, loanTime),
                                    linkAction: () => {
                                        (window as any).switchSection?.(isAdmin ? 'hardware-logs-view' : 'profile-view');
                                    }
                                });
                            }
                        }
                    }
                });
            });
        }

        const uniqueMap = new Map<string, typeof notifs[0]>();
        notifs.forEach(n => {
            if (!uniqueMap.has(n.id)) {
                uniqueMap.set(n.id, n);
            }
        });

        return Array.from(uniqueMap.values()).sort((a, b) => b.timestamp - a.timestamp);
    }

    public static updateNotifications() {
        this.ensureReadIds();
        const notifs = this.getPersonalizedNotifications();
        const unreadCount = notifs.filter(n => n.unread).length;

        const badge = document.getElementById('header-notif-badge');
        const dot = document.getElementById('header-notif-dot');

        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = String(unreadCount);
                badge.style.display = 'inline-flex';
            } else {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
        }

        if (dot) {
            dot.style.display = unreadCount > 0 ? 'block' : 'none';
        }
    }

    public static renderDropdown() {
        const listEl = document.getElementById('header-notif-list');
        const subEl = document.getElementById('notif-dropdown-sub');
        if (!listEl) return;

        const isAdmin = ModalManager.getCurrentRole() === 'ADMIN';
        if (subEl) {
            subEl.textContent = isAdmin ? 'Admin Alerts & Activity' : 'Your Personal Activity & Updates';
        }

        const viewAllBtn = document.getElementById('btn-notif-view-all-logs');
        if (viewAllBtn) {
            viewAllBtn.innerHTML = isAdmin
                ? `<span>View All in Logs</span><i data-lucide="arrow-right"></i>`
                : `<span>View My Activity</span><i data-lucide="arrow-right"></i>`;
        }

        const notifs = this.getPersonalizedNotifications().slice(0, 8);

        if (notifs.length === 0) {
            listEl.innerHTML = `
                <div class="notif-empty-state">
                    <i data-lucide="bell-off"></i>
                    <h5>No Notifications</h5>
                    <p>You're all caught up! There are no recent alerts for your account.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        const iconMap: Record<string, { icon: string; cls: string }> = {
            request: { icon: 'clock', cls: 'notif-type-pending' },
            issued: { icon: 'check-circle-2', cls: 'notif-type-issued' },
            returned: { icon: 'shield-check', cls: 'notif-type-returned' },
            due: { icon: 'alert-triangle', cls: 'notif-type-due' },
            admin_alert: { icon: 'bell', cls: 'notif-type-admin' }
        };

        listEl.innerHTML = notifs.map(n => {
            const cfg = iconMap[n.type] || { icon: 'info', cls: 'notif-type-info' };
            return `
                <div class="notif-item-card ${n.unread ? 'unread' : ''}" data-notif-id="${n.id}">
                    <div class="notif-item-icon-wrap ${cfg.cls}">
                        <i data-lucide="${cfg.icon}"></i>
                    </div>
                    <div class="notif-item-content">
                        <div class="notif-item-header">
                            <span class="notif-item-title">${AdminManager.escapeHtml(n.title)}</span>
                            <span class="notif-item-time">${n.time}</span>
                        </div>
                        <p class="notif-item-desc">${AdminManager.escapeHtml(n.message)}</p>
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.notif-item-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = (card as HTMLElement).dataset.notifId;
                if (id) {
                    this.readIds.add(id);
                    localStorage.setItem('cicr_read_notifs', JSON.stringify(Array.from(this.readIds)));
                    card.classList.remove('unread');
                    this.updateNotifications();
                }
                const notif = notifs.find(n => n.id === id);
                if (notif && notif.linkAction) {
                    const dropdown = document.getElementById('header-notif-dropdown');
                    if (dropdown) dropdown.style.display = 'none';
                    const notifBtn = document.getElementById('header-notif-btn');
                    if (notifBtn) notifBtn.setAttribute('aria-expanded', 'false');
                    notif.linkAction();
                }
            });
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    public static markAllAsRead() {
        this.ensureReadIds();
        const notifs = this.getPersonalizedNotifications();
        notifs.forEach(n => {
            this.readIds.add(n.id);
            if (n.id.startsWith('loan-')) this.readIds.add(n.id.replace('loan-', ''));
            if (n.id.startsWith('req-admin-')) this.readIds.add(n.id.replace('req-admin-', ''));
            if (n.id.startsWith('my-req-')) this.readIds.add(n.id.replace('my-req-', ''));
        });
        const now = Date.now();
        localStorage.setItem('cicr_last_read_all_time', String(now));
        localStorage.setItem('cicr_read_notifs', JSON.stringify(Array.from(this.readIds)));
        localStorage.setItem('cicr_notifs_cleared', 'true');

        if (typeof DatabaseManager !== 'undefined') {
            DatabaseManager.isNotificationsCleared = true;
            DatabaseManager.updateNotificationBadges();
        }

        const badge = document.getElementById('header-notif-badge');
        const dot = document.getElementById('header-notif-dot');
        if (badge) {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
        if (dot) {
            dot.style.display = 'none';
        }

        this.updateNotifications();
        this.renderDropdown();

        // Immediate visual feedback on the button
        const clearBtn = document.getElementById('btn-clear-notifs');
        if (clearBtn && !(clearBtn as HTMLButtonElement).disabled) {
            const originalHTML = clearBtn.innerHTML;
            clearBtn.innerHTML = `<i data-lucide="check"></i> <span>All Read</span>`;
            (clearBtn as HTMLButtonElement).disabled = true;
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
            setTimeout(() => {
                clearBtn.innerHTML = originalHTML;
                (clearBtn as HTMLButtonElement).disabled = false;
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }, 2000);
        }

        if (typeof ToastManager !== 'undefined' && typeof ToastManager.show === 'function') {
            ToastManager.show('All Caught Up', 'All notifications have been marked as read.', 'success');
        }
    }

    private static formatRelativeTime(ts: number): string {
        const diffMs = Date.now() - ts;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
}

(window as any).NotificationCenterManager = NotificationCenterManager;

// ==========================================
// Theme Manager System
// ==========================================
class ThemeManager {
    private static themeSelectEl: HTMLSelectElement | null = null;
    private static navThemeSelectEl: HTMLSelectElement | null = null;
    private static headerThemeSelectEl: HTMLSelectElement | null = null;

    public static init() {

        this.themeSelectEl = document.getElementById('theme-select') as HTMLSelectElement;
        this.navThemeSelectEl = document.getElementById('nav-theme-select') as HTMLSelectElement;
        this.headerThemeSelectEl = document.getElementById('header-theme-select') as HTMLSelectElement;

        const storedTheme = localStorage.getItem('cicr_vault_theme') || localStorage.getItem('cicr_theme');
        // Safe migration for legacy and invalid themes -> default to Midnight Mono ('mono')
        let defaultTheme = 'mono';
        if (storedTheme === 'light') {
            defaultTheme = 'light';
        } else if (storedTheme === 'mono') {
            defaultTheme = 'mono';
        } else {
            defaultTheme = 'mono';
        }
        this.applyTheme(defaultTheme);

        if (this.themeSelectEl) {
            this.themeSelectEl.value = defaultTheme;
            this.themeSelectEl.addEventListener('change', (e) => {
                const val = (e.target as HTMLSelectElement).value;
                this.applyTheme(val);
            });
        }

        if (this.navThemeSelectEl) {
            this.navThemeSelectEl.value = defaultTheme;
            this.navThemeSelectEl.addEventListener('change', (e) => {
                const val = (e.target as HTMLSelectElement).value;
                this.applyTheme(val);
            });
        }

        if (this.headerThemeSelectEl) {
            this.headerThemeSelectEl.value = defaultTheme;
            this.headerThemeSelectEl.addEventListener('change', (e) => {
                const val = (e.target as HTMLSelectElement).value;
                this.applyTheme(val);
            });
        }

        const themeBtnLight = document.getElementById('theme-btn-light');
        const themeBtnMono = document.getElementById('theme-btn-mono');

        if (themeBtnLight) {
            themeBtnLight.addEventListener('click', () => {
                this.applyTheme('light');
            });
        }
        if (themeBtnMono) {
            themeBtnMono.addEventListener('click', () => {
                this.applyTheme('mono');
            });
        }

        const authThemeToggle = document.getElementById('auth-theme-toggle');
        if (authThemeToggle) {
            authThemeToggle.addEventListener('click', (e) => {
                e.preventDefault();
                const cur = document.documentElement.getAttribute('data-theme') || 'mono';
                const next = cur === 'light' ? 'mono' : 'light';
                this.applyTheme(next);
            });
        }
    }

    public static applyTheme(theme: string) {
        if (theme !== 'light' && theme !== 'mono') {
            theme = 'mono';
        }

        // Direct, non-blocking class & attribute switches
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.remove('theme-light', 'theme-mono');
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem('cicr_vault_theme', theme);
        localStorage.setItem('cicr_theme', theme);

        const authThemeLabel = document.querySelector('.auth-theme-label');
        if (authThemeLabel) {
            authThemeLabel.textContent = theme === 'light' ? 'Robo Lab' : 'Midnight Mono';
        }

        if (this.themeSelectEl && this.themeSelectEl.value !== theme) {
            this.themeSelectEl.value = theme;
        }
        if (this.navThemeSelectEl && this.navThemeSelectEl.value !== theme) {
            this.navThemeSelectEl.value = theme;
        }
        if (this.headerThemeSelectEl && this.headerThemeSelectEl.value !== theme) {
            this.headerThemeSelectEl.value = theme;
        }

        // Fast toggle for sidebar theme buttons
        const themeBtnLight = document.getElementById('theme-btn-light');
        const themeBtnMono = document.getElementById('theme-btn-mono');
        if (themeBtnLight) themeBtnLight.classList.toggle('active', theme === 'light');
        if (themeBtnMono) themeBtnMono.classList.toggle('active', theme === 'mono');

        if (window.bg3D) {
            window.bg3D.updateThemeColors(theme);
        }
    }
}

// ==========================================
// 7. Application Bootstrap
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    AuthManager.init();
    ThemeManager.init();
    DatabaseManager.init();
    ModalManager.init();
    PasswordResetManager.init();
    TeamShowcaseManager.init();
    ProfileViewManager.init();
    ProfileEditManager.init();
    HardwareLedgerManager.init();
    NotificationCenterManager.init();
    window.bg3D = new Background3D();
    AdminManager.init();
    DatabaseManager.updateNotificationBadges();
    DatabaseManager.startAutoSync(45000);
    lucide.createIcons();

    // High-performance scroll state tracker with automatic debounced reset & zero DOM thrashing
    let scrollEndTimer: any = null;
    window.addEventListener('scroll', () => {
        (window as any).isUserScrolling = true;
        if (!document.body.classList.contains('is-scrolling')) {
            document.body.classList.add('is-scrolling');
        }
        clearTimeout(scrollEndTimer);
        scrollEndTimer = setTimeout(() => {
            (window as any).isUserScrolling = false;
            document.body.classList.remove('is-scrolling');
            if ((window as any)._pendingDashboardRender && window.dashboard) {
                (window as any)._pendingDashboardRender = false;
                window.dashboard.renderInventory();
            }
        }, 120);
    }, { passive: true });

    // Immediate section reveal activation to eliminate 1-second scroll loading delay
    const revealElements = document.querySelectorAll('.reveal:not(section):not([id$="-view"])');
    revealElements.forEach(el => el.classList.add('active'));

    // Real-Time Sidebar Alignment Sync (Desktop Viewport-Fixed Positioning)
    const syncFixedSidebarPosition = () => {
        // Native CSS Grid sticky positioning provides zero-jitter, pixel-perfect alignment
    };

    (window as any).syncFixedSidebarPosition = syncFixedSidebarPosition;
    window.addEventListener('resize', syncFixedSidebarPosition, { passive: true });
    window.addEventListener('orientationchange', syncFixedSidebarPosition, { passive: true });
    syncFixedSidebarPosition();

    // Cross-Tab Synchronization via Window Storage Event (Issue #48)
    window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === 'cicr_token') {
            if (!e.newValue && document.body.classList.contains('authenticated')) {
                AuthManager.handleLogout();
            } else if (e.newValue && !document.body.classList.contains('authenticated')) {
                window.location.reload();
            }
        } else if (e.key === 'cicr_vault_theme' || e.key === 'cicr_theme') {
            const newTheme = e.newValue;
            if (newTheme && (newTheme === 'mono' || newTheme === 'light')) {
                ThemeManager.applyTheme(newTheme);
            }
        } else if (e.key === 'cicr_cart_items') {
            if (typeof CartManager !== 'undefined') {
                CartManager.reloadFromStorage();
            }
        }
    });
});
