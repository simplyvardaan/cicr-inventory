import * as THREE from 'three';
import './style.css';
import type { InventoryItem, ActivityLog, RequestRecord, BorrowRecord } from './types';

// Global declarations for CDN libraries
declare const lucide: {
    createIcons: (options?: any) => void;
};

// Safe, idempotent Lucide icon renderer that NEVER destroys already-rendered SVGs
function renderLucideIcons(root?: HTMLElement | Document | null) {
    const rawCreateIcons = (window as any).__rawLucideCreateIcons || (typeof lucide !== 'undefined' ? lucide.createIcons : null);
    if (!rawCreateIcons) return;
    const target = root || document;

    // Only select elements that need icon creation (not already rendered SVGs)
    const placeholders = target.querySelectorAll('i[data-lucide], span[data-lucide], [data-lucide]:not(svg)');
    if (placeholders.length === 0) return;

    try {
        rawCreateIcons({
            root: target instanceof HTMLElement ? target : undefined
        });
    } catch {
        try { rawCreateIcons(); } catch {}
    }

    // Strip data-lucide from rendered SVGs to prevent future calls from destroying/re-rendering them
    const renderedSvgs = target.querySelectorAll('svg[data-lucide]');
    renderedSvgs.forEach(svg => {
        svg.removeAttribute('data-lucide');
        svg.setAttribute('data-lucide-rendered', 'true');
    });
}

// Intercept lucide.createIcons globally so ANY third-party or legacy call is automatically safe
if (typeof window !== 'undefined') {
    const installLucideGuard = () => {
        if (typeof lucide !== 'undefined' && lucide.createIcons && !(window as any).__rawLucideCreateIcons) {
            (window as any).__rawLucideCreateIcons = lucide.createIcons.bind(lucide);
            lucide.createIcons = (options?: any) => {
                const root = options && options.root ? options.root : undefined;
                renderLucideIcons(root);
            };
        }
    };
    installLucideGuard();
    window.addEventListener('DOMContentLoaded', installLucideGuard);
}

// Dynamic API URL for Local Development & Live Production
const isLocalHost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.endsWith('.local')
);

let API_BASE = (import.meta.env.VITE_API_BASE as string) ||
    (isLocalHost
        ? `http://${(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'localhost' : window.location.hostname}:5000/api`
        : 'https://cicr-inventory-backend.onrender.com/api');

const CLOUD_API_FALLBACK = 'https://cicr-inventory-backend.onrender.com/api';

// Intelligent Automatic Failover: If local backend request fails, fall back for that request without permanently poisoning API_BASE
if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        try {
            return await originalFetch(input, init);
        } catch (err: any) {
            const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
            if (urlStr && (urlStr.includes(':5000/api'))) {
                const fallbackUrl = urlStr.replace(/https?:\/\/[^/]+:5000\/api/, CLOUD_API_FALLBACK);
                console.warn(`[CICR API] Local backend unreachable. Auto-falling back to cloud backend: ${fallbackUrl}`);
                return originalFetch(fallbackUrl, init);
            }
            throw err;
        }
    };
}

const ADMIN_USERNAME = 'SRVKILLER09';

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
                <h4 class="toast-title">${title}</h4>
                <p class="toast-desc">${desc}</p>
            </div>
            <button class="toast-close-btn" title="Dismiss">
                <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
        `;

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
                <span class="welcome-avatar-letter">${initial}</span>
                <span class="welcome-status-dot"></span>
            </div>
            <div class="welcome-body">
                <div class="welcome-top-meta">
                    <span class="welcome-badge">
                        <i data-lucide="shield-check"></i> AUTHENTICATED
                    </span>
                    <span class="welcome-role-pill ${displayRole.toLowerCase()}">${displayRole}</span>
                </div>
                <div class="welcome-headline">
                    Welcome, <span class="welcome-highlight-name">${userName}</span>
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
// 2. Three.js 3D Background Engine
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
        this.scene.fog = new THREE.FogExp2(0x151b13, 0.015);

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

        const pointLight = new THREE.PointLight(0xe9ddc6, 1.2, 100);
        pointLight.position.set(0, 10, -20);
        this.scene.add(pointLight);

        const pointLight2 = new THREE.PointLight(0x9c78ed, 1.0, 100);
        pointLight2.position.set(20, 5, 10);
        this.scene.add(pointLight2);
    }

    public updateThemeColors(theme: string) {
        this.currentTheme = theme;
        if (this.scene && this.scene.fog) {
            if (theme === 'light') {
                this.scene.fog.color.setHex(0xe8ebf5);
            } else {
                this.scene.fog.color.setHex(0x151b13);
            }
        }
        this.setParticleColorsForTheme(theme);
    }

    private setParticleColorsForTheme(theme: string) {
        if (!this.particles) return;
        const colors = this.particles.geometry.attributes.color.array as Float32Array;
        const count = colors.length / 3;

        let c1: THREE.Color, c2: THREE.Color;
        if (theme === 'light') {
            c1 = new THREE.Color(0x9c78ed); // Robo Lab Purple
            c2 = new THREE.Color(0xf5b8eb); // Robo Lab Soft Pink
        } else {
            // Default Midnight Mono (Muted Sage & Warm Cream)
            c1 = new THREE.Color(0x758071);
            c2 = new THREE.Color(0xe9ddc6);
        }

        for (let i = 0; i < count; i++) {
            const ratio = Math.random();
            const c = c1.clone().lerp(c2, ratio);

            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        this.particles.geometry.attributes.color.needsUpdate = true;
    }

    private createParticles() {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const particleCount = isMobile ? 80 : 350;
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
            // On mobile devices, scrolling expands/collapses the URL address bar which triggers innerHeight resize events.
            // Only reallocate the WebGL backing canvas buffer if innerWidth actually changes (device rotation / orientation change).
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

        const isScrolling = !!(window as any).isUserScrolling;
        if (isScrolling) {
            // Pause 3D particle updates and scene re-renders during active scrolling to keep 60fps buttery smooth
            return;
        }

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
        const CURRENT_STATE_EPOCH = 'cicr_v7_clean_reset_all_sync';
        if (localStorage.getItem('cicr_fresh_epoch') !== CURRENT_STATE_EPOCH) {
            localStorage.removeItem('cicr_requests');
            localStorage.removeItem('cicr_logs');
            localStorage.removeItem('cicr_inventory');
            localStorage.removeItem('cicr_dismissed_requests');
            localStorage.removeItem('cicr_pending_returns');
            localStorage.setItem('cicr_notifs_cleared', 'true');
            localStorage.setItem('cicr_fresh_epoch', CURRENT_STATE_EPOCH);
            DatabaseManager.isNotificationsCleared = true;
            inventory = [];
            logs = [];
            requests = [];
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
                    r && r.purpose &&
                    r.id !== 'req_1789341756703_7d6b6494' &&
                    !r.purpose.toLowerCase().includes('testing') &&
                    !r.purpose.toLowerCase().includes('robo soccer')
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

            // 1. Fetch items, borrow records, audit, and own request status concurrently in parallel
            const [itemsOutcome, borrowOutcome, auditOutcome, requestsOutcome] = await Promise.allSettled([
                fetch(`${API_BASE}/items`, { headers }),
                token ? fetch(`${API_BASE}/borrow/history`, { headers }) : Promise.reject('No token'),
                token ? fetch(`${API_BASE}/audit`, { headers }) : Promise.reject('No token'),
                token ? fetch(`${API_BASE}/borrow/requests`, { headers }) : Promise.reject('No token')
            ]);

            let dbItems: any[] = [];
            if (itemsOutcome.status === 'fulfilled' && itemsOutcome.value.ok) {
                try {
                    const json = await itemsOutcome.value.json();
                    dbItems = json.data || [];
                } catch { }
            }

            let liveBorrows: any[] = [];
            if (borrowOutcome.status === 'fulfilled' && borrowOutcome.value.ok) {
                try {
                    const bJson = await borrowOutcome.value.json();
                    liveBorrows = bJson.data || [];
                } catch (be) {
                    console.warn('Live borrow parse failed:', be);
                }
            }

            if (dbItems.length > 0) {
                // Map Supabase inventory format to frontend InventoryItem format
                inventory = dbItems.map((item: any) => {
                    let cat = (item.category || '').toLowerCase();
                    if (cat.includes('controller') || cat.includes('mcu') || cat.includes('board') || cat.includes('programmer')) cat = 'microcontrollers';
                    else if (cat.includes('sensor')) cat = 'sensors';
                    else if (cat.includes('actuator') || cat.includes('motor') || cat.includes('esc') || cat.includes('servo') || cat.includes('driver')) cat = 'actuators';
                    else if (cat.includes('power') || cat.includes('battery') || cat.includes('charge') || cat.includes('supply')) cat = 'power';
                    else if (cat.includes('tool') || cat.includes('comm') || cat.includes('display') || cat.includes('remote') || cat.includes('cable') || cat.includes('mechanical') || cat.includes('misc')) cat = 'tools';

                    const itemBorrows = liveBorrows
                        .filter((b: any) => (b.inventory_id === item.id || b.item_id === item.id) && (b.status === 'BORROWED' || b.status === 'RETURN_REQUESTED' || b.status === 'RETURNED'))
                        .map((b: any) => ({
                            id: b.id,
                            userId: b.user_id || b.users?.id,
                            email: b.users?.email || b.borrower_email || b.email,
                            borrowerEmail: b.users?.email || b.borrower_email || b.email,
                            name: b.users?.name || b.borrower_name || 'Student',
                            roll: b.users?.roll_number || b.roll_number || 'ID',
                            rollNumber: b.users?.roll_number || b.roll_number,
                            qty: Number(b.quantity) || 1,
                            purpose: b.purpose || 'Robotics Project',
                            date: b.borrowed_at ? b.borrowed_at.split('T')[0] : new Date().toISOString().split('T')[0],
                            dueDate: b.due_date ? b.due_date.split('T')[0] : '',
                            status: b.status || 'BORROWED',
                            returned: b.status === 'RETURNED',
                            returnedAt: b.returned_at
                        }));

                    const activeBorrows = itemBorrows.filter((b: any) => !b.returned);
                    const borrowedSum = activeBorrows.reduce((sum: number, rec: any) => sum + rec.qty, 0);
                    const totalQty = Number(item.quantity) || 0;
                    const availableQty = (item.available_quantity !== undefined && item.available_quantity !== null)
                        ? Math.min(totalQty, Math.max(0, Number(item.available_quantity)))
                        : Math.max(0, totalQty - borrowedSum);

                    let cleanName = (item.name || '').trim();
                    if (cleanName.toLowerCase().includes('model unclear') || cleanName.toLowerCase() === 'arduino board') {
                        cleanName = 'Arduino Uno R3';
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
                        borrowedBy: itemBorrows
                    };
                });

                // Save to localStorage cache
                this.save();
            }

            // Process audit logs
            if (auditOutcome.status === 'fulfilled' && auditOutcome.value.ok) {
                try {
                    const aJson = await auditOutcome.value.json();
                    if (Array.isArray(aJson.data)) {
                        logs = aJson.data.map((l: any) => ({
                            type: l.action.toLowerCase().includes('borrow') ? 'borrow'
                                : l.action.toLowerCase().includes('return') ? 'return'
                                    : l.action.toLowerCase().includes('add') ? 'add' : 'system',
                            timestamp: l.created_at || new Date().toISOString(),
                            text: l.description || l.action
                        }));
                        localStorage.setItem('cicr_logs', JSON.stringify(logs));
                    }
                } catch (ae) {
                    console.warn('Live audit parse failed:', ae);
                }
            }

            // Sync canonical request statuses from server
            if (requestsOutcome.status === 'fulfilled' && requestsOutcome.value.ok) {
                try {
                    const rJson = await requestsOutcome.value.json();
                    const serverRequests = Array.isArray(rJson.data) ? rJson.data : [];
                    if (serverRequests.length === 0) {
                        requests = [];
                        localStorage.setItem('cicr_requests', JSON.stringify([]));
                    } else {
                        const mappedServerReqs: RequestRecord[] = serverRequests.map((r: any) => ({
                            id: r.id,
                            type: r.type || 'ISSUE',
                            borrowId: r.borrowId,
                            returnQuantity: r.returnQuantity,
                            itemId: r.itemId,
                            itemName: r.itemName,
                            name: r.borrowerName,
                            roll: r.rollNumber,
                            qty: r.type === 'RETURN' ? (r.returnQuantity || r.quantity || 1) : (r.quantity || 1),
                            purpose: r.purpose,
                            dueDate: r.dueDate,
                            status: r.status,
                            requestedAt: r.requestedAt,
                            reviewedAt: r.reviewedAt,
                            reviewedBy: r.reviewedBy,
                            reviewNote: r.reviewNote
                        }));

                        requests = mappedServerReqs;
                        localStorage.setItem('cicr_requests', JSON.stringify(requests));
                    }
                } catch (re) {
                    console.warn('Live request status parse failed:', re);
                }
            }

            if (window.dashboard && dbItems.length > 0) {
                window.dashboard.renderStats();
                if ((window as any).isUserScrolling) {
                    (window as any)._pendingDashboardRender = true;
                } else {
                    window.dashboard.renderInventory();
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

        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        const authName = (localStorage.getItem('cicr_auth') || '').toLowerCase().trim();
        const userName = (storedUser.name || '').toLowerCase().trim();
        const userEmail = (storedUser.email || '').toLowerCase().trim();
        const userRoll = (storedUser.roll_number || storedUser.roll || '').toLowerCase().trim();

        const isUserLoan = (rec: BorrowRecord) => ModalManager.isUserLoanMatch(rec);

        const isUserRequest = (req: any) => {
            const rName = (req.name || req.borrowerName || '').toLowerCase().trim();
            const rRoll = (req.roll || req.rollNumber || '').toLowerCase().trim();
            const rEmail = (req.email || req.borrowerEmail || '').toLowerCase().trim();
            if (userRoll && rRoll && rRoll === userRoll) return true;
            if (userEmail && rEmail && rEmail === userEmail) return true;
            if (userName && rName && (rName === userName || rName.includes(userName) || userName.includes(rName))) return true;
            if (authName && (rName === authName || rEmail === authName)) return true;
            return false;
        };

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
        const allUserReqs: any[] = [];
        const seenReqKeys = new Set<string>();
        const dismissedRaw = localStorage.getItem('cicr_dismissed_requests');
        const dismissedSet: Set<string> = dismissedRaw ? new Set(JSON.parse(dismissedRaw)) : new Set();
        dismissedSet.add('req_1789341756703_7d6b6494');

        const addReq = (r: any) => {
            if (!r) return;
            const status = r.status || 'PENDING';
            if (status === 'PENDING' && (dismissedSet.has(r.id) || (r.borrowId && dismissedSet.has(r.borrowId)))) {
                return;
            }
            const key = `${r.id || ''}__${status}__${r.itemName || ''}__${r.borrowerEmail || r.email || ''}`;
            if (!seenReqKeys.has(key)) {
                seenReqKeys.add(key);
                allUserReqs.push(r);
            }
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
        } else if (allUserReqs.length > 0) {
            const totalStr = String(allUserReqs.length);
            if (sidebarBadge) {
                if (sidebarBadge.innerText !== totalStr) sidebarBadge.innerText = totalStr;
                if (sidebarBadge.style.display !== 'inline-flex') sidebarBadge.style.display = 'inline-flex';
                sidebarBadge.classList.remove('pulse');
            }
            if (sidebarBeacon) {
                sidebarBeacon.style.display = 'none';
            }
            if (navBadge) {
                if (navBadge.innerText !== totalStr) navBadge.innerText = totalStr;
                if (navBadge.style.display !== 'inline-flex') navBadge.style.display = 'inline-flex';
            }
        } else {
            if (sidebarBadge) sidebarBadge.style.display = 'none';
            if (sidebarBeacon) sidebarBeacon.style.display = 'none';
            if (navBadge) navBadge.style.display = 'none';
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
                if (role === 'ADMIN' && typeof AdminManager !== 'undefined') {
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

            const clockEl = document.getElementById('dashboard-clock');
            if (clockEl) {
                clockEl.innerText = `${formattedHours}:${minutes}:${seconds} ${ampm}`;
            }

            // Format date: Tuesday, 17 March 2026
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const dayName = days[now.getDay()];
            const dateNum = now.getDate();
            const monthName = months[now.getMonth()];
            const year = now.getFullYear();

            const dateEl = document.getElementById('dashboard-date');
            if (dateEl) {
                dateEl.innerText = `${dayName}, ${dateNum} ${monthName} ${year}`;
            }

            // Update time-of-day greeting
            const curHour = now.getHours();
            let timeOfDay = 'evening';
            if (curHour < 12) {
                timeOfDay = 'morning';
            } else if (curHour < 17) {
                timeOfDay = 'afternoon';
            }

            const username = localStorage.getItem('cicr_auth') || 'Operator';
            const greetingEl = document.getElementById('dashboard-greeting');
            if (greetingEl) {
                greetingEl.innerText = `Good ${timeOfDay}, ${username}`;
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
                if (sec.id === targetId) {
                    sec.classList.add('active');
                    sec.style.display = 'flex';
                    if (sec.id === 'inventory-view' || sec.id === 'projects-view' || sec.id === 'meetings-view' || sec.id === 'events-view' || sec.id === 'developers-view' || sec.id === 'profile-view' || sec.id === 'hardware-logs-view') {
                        sec.style.display = 'block';
                    }
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

            // Refresh Lucide icons if needed
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            // Update sidebar link active class
            sidebarLinks.forEach(link => {
                const target = (link as HTMLElement).dataset.target;
                if (target === targetId) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

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

            // If switching to admin-view, load admin data
            if (targetId === 'admin-view') {
                if (ModalManager.getCurrentRole() !== 'ADMIN') {
                    ToastManager.show('Access Restricted', 'Admin privileges required to access Admin Portal.', 'warning');
                    switchSection('inventory-view');
                    return;
                }
                AdminManager.loadUsers(true);
                AdminManager.loadHardwareRequests(true);
                AdminManager.loadAuditLogs();
            }

            // If switching to hardware-logs-view, render logs & component history
            if (targetId === 'hardware-logs-view') {
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
                    const authOverlay = document.getElementById('auth-overlay');
                    if (authOverlay) {
                        authOverlay.style.display = 'flex';
                        authOverlay.classList.remove('hidden');
                        document.getElementById('tab-login-btn')?.click();
                        ToastManager.show('Authentication Required', 'Please sign in to view your hardware requests and approval status.', 'info');
                    }
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

        // 7. Inventory Search Input listeners
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
            this.clearSearchBtn.style.display = this.searchQuery ? 'block' : 'none';
            this.renderInventory();
        });

        this.clearSearchBtn.addEventListener('click', () => {
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
            totalUnits += item.quantity;

            const activeBorrows = (item.borrowedBy || []).filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED');
            const borrowedSum = activeBorrows.reduce((sum, rec) => sum + rec.qty, 0);
            const currentAvailable = typeof item.availableQuantity === 'number'
                ? Math.min(item.quantity, Math.max(0, item.availableQuantity))
                : Math.max(0, item.quantity - borrowedSum);

            availableUnits += currentAvailable;
            if (currentAvailable > 0) {
                availableItemsCount++;
            }

            if (isAdmin) {
                checkedOutQty += borrowedSum;
            } else {
                const memberLoans = activeBorrows.filter((r: any) => ModalManager.isUserLoanMatch(r));
                checkedOutQty += memberLoans.reduce((sum, rec) => sum + rec.qty, 0);
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

        const filtered = inventory.filter(item => {
            const matchesCategory = this.activeCategory === 'all' || item.category === this.activeCategory;
            const matchesSearch = item.name.toLowerCase().includes(this.searchQuery) ||
                item.specs.toLowerCase().includes(this.searchQuery) ||
                item.location.toLowerCase().includes(this.searchQuery) ||
                (Array.isArray(item.tags) && item.tags.some((t: string) => t.toLowerCase().includes(this.searchQuery)));

            const activeBorrows = (item.borrowedBy || []).filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED');
            const borrowedSum = activeBorrows.reduce((sum, rec) => sum + rec.qty, 0);
            const totalQty = Number(item.quantity) || 0;
            const available = typeof item.availableQuantity === 'number'
                ? Math.min(totalQty, Math.max(0, item.availableQuantity))
                : Math.max(0, totalQty - borrowedSum);

            let matchesStock = true;
            if (this.activeStockFilter === 'available') {
                matchesStock = available > 0;
            } else if (this.activeStockFilter === 'borrowed') {
                if (isAdmin) {
                    matchesStock = borrowedSum > 0 || (typeof item.availableQuantity === 'number' && item.availableQuantity < totalQty);
                } else {
                    matchesStock = activeBorrows.some((r: any) => ModalManager.isUserLoanMatch(r));
                }
            } else if (this.activeStockFilter === 'low') {
                const status = getItemStockStatus(item.quantity, available);
                matchesStock = status.class === 'status-low';
            } else if (this.activeStockFilter === 'out') {
                const status = getItemStockStatus(item.quantity, available);
                matchesStock = status.class === 'status-out';
            }

            return matchesCategory && matchesSearch && matchesStock;
        });

        const currentFingerprint = `${role}_${this.activeCategory}_${this.activeStockFilter}_${this.searchQuery}_` +
            filtered.map(i => `${i.id}_${i.availableQuantity}_${i.quantity}_${i.name}_${i.location}_${(i.borrowedBy || []).map((b: any) => `${b.id}:${b.status}:${b.qty}`).join(',')}`).join('|');

        if (!force && this.lastRenderedFingerprint === currentFingerprint && this.inventoryGrid.children.length === filtered.length) {
            // Inventory data and filters have not changed; do NOT destroy/re-render DOM cards to prevent items popping up repeatedly
            return;
        }

        const isInitial = this.lastRenderedFingerprint === '';
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

        filtered.forEach((item, index) => {
            const card = this.createCardElement(item, isInitial);
            if (isInitial) {
                card.style.transitionDelay = `${(index % 4) * 0.06}s`;
                this.inventoryGrid.appendChild(card);
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        card.classList.add('active');
                    }, 40);
                });
            } else {
                card.style.transitionDelay = '0s';
                card.classList.add('active');
                this.inventoryGrid.appendChild(card);
            }
        });

        renderLucideIcons(this.inventoryGrid);

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

    private createCardElement(item: InventoryItem, isInitial = false): HTMLElement {
        const card = document.createElement('div');
        card.className = isInitial ? 'inventory-card glass reveal' : 'inventory-card glass active';

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
            <button class="btn-card-delete-item" data-id="${item.id}" data-name="${AdminManager.escapeHtml(itemName)}" onclick="event.stopPropagation(); event.preventDefault(); window.adminDeleteItem('${item.id}', '${AdminManager.escapeHtml(itemName)}')" title="Delete Component from Inventory">
                <i data-lucide="trash-2"></i>
            </button>
        ` : '';

        const myLoans = (item.borrowedBy || []).filter((r: any) => !r.returned && (r as any).status !== 'PENDING' && ModalManager.isUserLoanMatch(r));
        const myLoanTotal = myLoans.reduce((sum: number, r: any) => sum + (Number(r.qty) || 0), 0);
        const myPendingReturn = myLoans.some((r: any) => (r as any).status === 'RETURN_REQUESTED');
        const myLoanBadgeHtml = myLoanTotal > 0 ? `
            <div class="card-loan-action-pill" style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; background: ${myPendingReturn ? 'rgba(255, 183, 3, 0.12)' : 'rgba(0, 240, 255, 0.08)'}; border: 1px solid ${myPendingReturn ? 'rgba(255, 183, 3, 0.35)' : 'rgba(0, 240, 255, 0.28)'}; border-radius: 6px; padding: 5px 10px; font-size: 11px; color: ${myPendingReturn ? '#ffb703' : 'var(--neon-cyan)'}; cursor: pointer; transition: all 0.2s ease;">
                <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600;">
                    <i data-lucide="${myPendingReturn ? 'clock' : 'package-check'}" style="width: 12px; height: 12px;"></i> ${myPendingReturn ? `Return Pending (${myLoanTotal} issued)` : `You have ${myLoanTotal} issued`}
                </span>
                <span style="font-weight: 700; text-decoration: underline; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 3px;">
                    ${myPendingReturn ? 'View Status' : 'Return'} <i data-lucide="${myPendingReturn ? 'arrow-right' : 'corner-up-left'}" style="width: 11px; height: 11px;"></i>
                </span>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="card-glow-bar bar-${statusClass}"></div>
            <div class="card-header">
                <span class="card-category-badge cat-${item.category}">${categoryLabel}</span>
                <div class="card-header-actions">
                    <span class="status-indicator ${statusClass}">
                        <span class="status-indicator-dot"></span>
                        ${statusText}
                    </span>
                    ${deleteBtnHtml}
                </div>
            </div>
            <h3 class="card-title ${titleSizeClass}" title="${AdminManager.escapeHtml(itemName)}">${AdminManager.escapeHtml(itemName)}</h3>
            <p class="card-desc" title="${AdminManager.escapeHtml(item.specs)}">${AdminManager.escapeHtml(shortDesc)}</p>
            ${miniTagsHtml}
            ${myLoanBadgeHtml}
            <div class="card-footer">
                <div class="footer-info" title="${AdminManager.escapeHtml(item.location)}">
                    <span class="info-title">Location</span>
                    <span class="info-content"><i data-lucide="map-pin"></i> ${AdminManager.escapeHtml(shortLocation)}</span>
                </div>
                <div class="footer-info" style="align-items: flex-end;">
                    <span class="info-title">Availability</span>
                    <span class="info-content"><strong class="stock-curr ${statusClass}">${available}</strong> <span class="stock-divider">/</span> ${totalQty}</span>
                    <div class="availability-bar-track">
                        <div class="availability-bar-fill fill-${statusClass}" style="width: ${fillPercent}%"></div>
                    </div>
                </div>
            </div>
        `;

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
                            ModalManager.openReturnModal(activeLoan, item, item.borrowedBy.indexOf(activeLoan));
                        }
                    }
                });
            }
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

        document.querySelector('.btn-back-to-detail')!.addEventListener('click', () => {
            this.close('borrow-form-modal');
            this.open('detail-modal');
        });

        document.getElementById('btn-borrow')!.addEventListener('click', () => {
            this.openBorrowFormModal();
        });

        // Interactive Calendar Picker & Presets for Issue Return Date
        const dueDateInput = document.getElementById('borrow-due-date') as HTMLInputElement | null;
        const btnCalendar = document.getElementById('btn-calendar-picker');
        const calendarWrapper = document.getElementById('borrow-calendar-wrapper');
        const durationBadge = document.getElementById('borrow-duration-badge');
        const presetPills = document.querySelectorAll('.date-preset-pill');

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
        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        const authName = (localStorage.getItem('cicr_auth') || '').toLowerCase().trim();
        const userName = (storedUser.name || '').toLowerCase().trim();
        const userEmail = (storedUser.email || '').toLowerCase().trim();
        const userRoll = (storedUser.roll_number || storedUser.roll || '').toLowerCase().trim();
        const userId = storedUser.id || '';
        const recUserId = (rec as any).userId || (rec as any).user_id || '';

        // 1. Direct User ID match (most authoritative)
        if (userId && recUserId && userId === recUserId) return true;

        // 2. Exact Roll Number match
        const rRoll = (rec.roll || '').toLowerCase().trim();
        if (userRoll && rRoll && userRoll === rRoll) return true;
        if (userEmail && rRoll && (userEmail.startsWith(`${rRoll}@`) || userEmail === `${rRoll}@mail.jiit.ac.in`)) return true;

        // 3. Exact Email match if rec has email
        const recEmail = ((rec as any).email || (rec as any).borrowerEmail || '').toLowerCase().trim();
        if (userEmail && recEmail && userEmail === recEmail) return true;

        // 4. Exact Name match (guarding against generic placeholders like "member", "student", "user", "admin")
        const rName = (rec.name || '').toLowerCase().trim();
        const isGenericName = (n: string) => !n || ['member', 'student', 'user', 'admin', 'borrower', 'guest'].includes(n) || n.length < 3;
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

    public static isDesignatedAdminUser(email?: string | null, name?: string | null, username?: string | null): boolean {
        const normEmail = (email || '').toLowerCase().trim();
        const normName = (name || '').toLowerCase().trim();
        const normUser = (username || '').toLowerCase().trim();

        // 1. Gunjan Pal
        if (
            normEmail === '992401210050@mail.jiit.ac.in' ||
            normEmail.includes('992401210050') ||
            normEmail.includes('gunjan') ||
            normName.includes('gunjan') ||
            normUser.includes('gunjan')
        ) {
            return true;
        }

        // 2. Dhruvi Gupta
        if (
            normEmail === '992401030123@mail.jiit.ac.in' ||
            normEmail.includes('992401030123') ||
            normEmail.includes('dhruvi') ||
            normName.includes('dhruvi') ||
            normUser.includes('dhruvi')
        ) {
            return true;
        }

        // 3. Aryan Varshney
        if (
            normEmail === '992401030154@mail.jiit.ac.in' ||
            normEmail.includes('992401030154') ||
            normEmail.includes('aryan') ||
            normName.includes('aryan') ||
            normUser.includes('aryan')
        ) {
            return true;
        }

        // 4. Vardaan Saxena / Master Admins
        if (
            normEmail === 'vardaansaxena096@gmail.com' ||
            normEmail === 'cicrinventory@gmail.com' ||
            normEmail === '992501030399@mail.jiit.ac.in' ||
            normEmail.includes('992501030399') ||
            normEmail.includes('vardaan') ||
            normName.includes('vardaan') ||
            normUser.includes('vardaan') ||
            normUser === 'srvkiller09' ||
            normUser === ADMIN_USERNAME.toLowerCase()
        ) {
            return true;
        }

        return false;
    }

    public static getCurrentRole(): UserRole {
        const userStr = localStorage.getItem('cicr_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                const email = (user.email || '').toLowerCase().trim();
                const name = (user.name || '').toLowerCase().trim();
                const username = (user.username || '').toLowerCase().trim();

                // Designated Admins: Gunjan, Dhruvi, Aryan & Vardaan ALWAYS have full ADMIN powers!
                if (this.isDesignatedAdminUser(email, name, username)) {
                    return 'ADMIN';
                }

                // Verified DB admin role
                if (user.role === 'ADMIN') {
                    return 'ADMIN';
                }

                // Blocked from admin
                if (email === 'mahakkatahara.mk@gmail.com') {
                    return 'MEMBER';
                }

                if (email.endsWith('@mail.jiit.ac.in') || email.endsWith('@jiit.ac.in')) {
                    return 'MEMBER';
                }

                return 'MEMBER';
            } catch { }
        }

        const storedRole = localStorage.getItem('cicr_role');
        const authName = (localStorage.getItem('cicr_auth') || '').toLowerCase().trim();

        if (this.isDesignatedAdminUser(authName, authName, authName)) {
            return 'ADMIN';
        }

        if (storedRole === 'ADMIN') {
            return 'ADMIN';
        }

        return 'MEMBER';
    }

    private static isAdmin() {
        return this.getCurrentRole() === 'ADMIN';
    }

    private static setBorrowModalMode(_mode: 'borrow' | 'request', componentName: string, available: number) {
        const modalTitle = document.getElementById('borrow-form-title');
        const subtitle = document.getElementById('borrow-form-subtitle');
        const submitBtn = document.getElementById('borrow-form-submit') as HTMLButtonElement | null;
        const qtyLimit = document.getElementById('borrow-qty-limit');

        if (modalTitle) {
            modalTitle.innerText = 'Request Component Issue';
        }
        if (subtitle) {
            subtitle.innerText = `Requesting ${componentName} - Requires Admin Authorization`;
        }
        if (submitBtn) {
            submitBtn.innerText = 'Submit Issue Request';
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
                        <h4 class="request-item-title">${request.itemName}</h4>
                        <div class="request-item-meta">
                            <span>${request.name}</span>
                            <span>${request.roll}</span>
                            <span>${request.qty} units</span>
                        </div>
                    </div>
                    <span class="request-status-chip request-status-pending">${request.status}</span>
                </div>
                <div class="request-item-meta">
                    <span>Purpose: ${request.purpose}</span>
                    <span>Requested: ${request.requestedAt}</span>
                </div>
                <div class="request-item-actions">
                    <button class="btn btn-primary request-approve-btn" data-request-id="${request.id}">
                        <i data-lucide="check"></i> Approve
                    </button>
                    <button class="btn btn-secondary request-reject-btn" data-request-id="${request.id}">
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

        const borrowBtn = document.getElementById('btn-borrow') as HTMLButtonElement;
        const returnBtn = document.getElementById('btn-return') as HTMLButtonElement;

        const status = getItemStockStatus(totalQty, available);
        badge.innerText = status.text;
        badge.className = `modal-status-badge ${status.class}`;

        if (available > 0) {
            borrowBtn.disabled = false;
            borrowBtn.style.opacity = '1';
        } else {
            borrowBtn.disabled = true;
            borrowBtn.style.opacity = '0.5';
        }

        const myLoans = (item.borrowedBy || []).filter(rec => !rec.returned && (rec as any).status !== 'PENDING' && ModalManager.isUserLoanMatch(rec));
        const myActiveLoan = myLoans.find(r => (r as any).status !== 'RETURN_REQUESTED') || myLoans[0];
        const anyActiveLoan = (item.borrowedBy || []).find(rec => !rec.returned && (rec as any).status !== 'PENDING');
        const targetLoan = myActiveLoan || (role === 'ADMIN' ? anyActiveLoan : null);

        // Display Return Issued Component button
        if (targetLoan) {
            const isPendingReturn = (targetLoan as any).status === 'RETURN_REQUESTED';
            returnBtn.style.display = 'inline-flex';
            if (isPendingReturn) {
                returnBtn.disabled = true;
                returnBtn.style.opacity = '0.75';
                returnBtn.style.cursor = 'not-allowed';
                returnBtn.innerHTML = '<i data-lucide="clock"></i> Return Pending Admin Verification';
                returnBtn.onclick = null;
            } else {
                returnBtn.disabled = false;
                returnBtn.style.opacity = '1';
                returnBtn.style.cursor = 'pointer';
                returnBtn.innerHTML = '<i data-lucide="corner-up-left"></i> Return Component';
                returnBtn.onclick = () => {
                    this.openReturnModal(targetLoan, item, item.borrowedBy.indexOf(targetLoan));
                };
            }
        } else {
            returnBtn.style.display = 'none';
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

        if (role === 'ADMIN') {
            borrowBtn.innerHTML = '<i data-lucide="shopping-cart"></i> Checkout / Borrow';
        } else {
            borrowBtn.innerHTML = '<i data-lucide="send"></i> Request Issue';
        }

        const borrowersPanel = document.getElementById('borrowers-panel')!;
        const listContainer = document.getElementById('borrowers-list')!;
        listContainer.innerHTML = '';

        const isMember = role !== 'ADMIN';
        const visibleBorrowers = isMember
            ? (item.borrowedBy || []).filter(rec => !rec.returned && ModalManager.isUserLoanMatch(rec))
            : (item.borrowedBy || []).filter(rec => !rec.returned);

        if (visibleBorrowers.length > 0) {
            borrowersPanel.style.display = 'block';
            const todayStr = new Date().toISOString().split('T')[0];

            visibleBorrowers.forEach((rec) => {
                const origIdx = item.borrowedBy.indexOf(rec);
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

                const recEl = document.createElement('div');
                recEl.className = 'borrower-record';
                recEl.innerHTML = `
                    <div class="borrower-info-main">
                        <span class="borrower-name">${rec.name} ${isMyRecord ? '(Your Active Loan)' : ''}</span>
                        <span class="borrower-roll">${rec.roll} &bull; ${rec.purpose}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${statusBadge}
                        <span class="borrower-qty-badge">${rec.qty} units</span>
                        ${canReturn ? (
                        isRecPendingReturn
                            ? `<button class="btn btn-secondary" disabled style="padding: 6px 10px; font-size: 11px; opacity: 0.6; cursor: not-allowed;"><i data-lucide="clock" style="width:12px;height:12px;"></i> Verification Pending</button>`
                            : `<button class="btn btn-secondary btn-inline-return" style="padding: 6px 10px; font-size: 11px;"><i data-lucide="corner-up-left" style="width:12px;height:12px;"></i> Return</button>`
                    ) : ''}
                    </div>
                `;

                if (canReturn && !isRecPendingReturn) {
                    recEl.querySelector('.btn-inline-return')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openReturnModal(rec, item, origIdx);
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

        const borrowedSum = (selectedItem.borrowedBy || [])
            .filter((r: any) => !r.returned && (r as any).status !== 'RETURNED' && (r as any).status !== 'REJECTED')
            .reduce((sum, rec) => sum + rec.qty, 0);
        const available = typeof selectedItem.availableQuantity === 'number'
            ? selectedItem.availableQuantity
            : Math.max(0, selectedItem.quantity - borrowedSum);

        this.setBorrowModalMode('request', selectedItem.name, available);

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

        const nameInput = document.getElementById('borrow-name') as HTMLInputElement | null;
        if (nameInput) {
            nameInput.value = currentUserName || '';
            nameInput.defaultValue = currentUserName || '';
            nameInput.readOnly = true;
            nameInput.setAttribute('tabindex', '-1');
            nameInput.title = 'Verified account identity (locked)';
        }

        const rollInput = document.getElementById('borrow-roll') as HTMLInputElement | null;
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
        const authName = (localStorage.getItem('cicr_auth') || '').toLowerCase().trim();
        const userName = (storedUser.name || '').toLowerCase().trim();
        const userEmail = (storedUser.email || '').toLowerCase().trim();
        const userRoll = (storedUser.roll_number || storedUser.roll || '').toLowerCase().trim();

        const isUserRequest = (req: any) => {
            const rName = (req.name || req.borrowerName || '').toLowerCase().trim();
            const rRoll = (req.roll || req.rollNumber || '').toLowerCase().trim();
            const rEmail = (req.email || req.borrowerEmail || '').toLowerCase().trim();
            if (userRoll && rRoll && rRoll === userRoll) return true;
            if (userEmail && rEmail && rEmail === userEmail) return true;
            if (userName && rName && (rName === userName || rName.includes(userName) || userName.includes(rName))) return true;
            if (authName && (rName === authName || rEmail === authName)) return true;
            return false;
        };

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
        const combinedRequests: (RequestRecord | AdminHardwareRequest)[] = [];
        const seenDrawerReqKeys = new Set<string>();

        const getDrawerKey = (r: any): string => {
            if (typeof AdminManager !== 'undefined' && typeof AdminManager.getRequestCanonicalKey === 'function') {
                return AdminManager.getRequestCanonicalKey(r);
            }
            const isReturn = r.type === 'RETURN' || Boolean(r.borrowId);
            if (isReturn) return `ret__${(r.borrowId || r.id || '').trim()}`;
            const email = (r.borrowerEmail || r.email || '').toLowerCase().trim();
            const name = (r.borrowerName || r.name || '').toLowerCase().trim();
            const itemId = (r.itemId || '').toLowerCase().trim();
            const qty = Number(r.quantity || r.qty) || 1;
            const purp = (r.purpose || '').toLowerCase().trim();
            const reqTime = r.requestedAt ? new Date(r.requestedAt).getTime() : 0;
            const timeBucket = reqTime > 0 ? Math.floor(reqTime / 120000) : 0;
            return `iss__${email}__${name}__${itemId}__${qty}__${purp}__${timeBucket}`;
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

        // For non-admin, use AdminManager.userHardwareRequests first (keeps PENDING, APPROVED, REJECTED)
        if (!isAdmin && typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.userHardwareRequests) && AdminManager.userHardwareRequests.length > 0) {
            AdminManager.userHardwareRequests.forEach(r => {
                if (r) {
                    const key = getDrawerKey(r) + '__' + (r.status || 'PENDING');
                    if (!seenDrawerReqKeys.has(key) && !seenDrawerReqKeys.has(r.id)) {
                        seenDrawerReqKeys.add(key);
                        seenDrawerReqKeys.add(r.id);
                        combinedRequests.push(r);
                    }
                }
            });
        }

        if (typeof AdminManager !== 'undefined' && Array.isArray(AdminManager.hardwareRequests)) {
            AdminManager.hardwareRequests.forEach(r => {
                if (r && (!isAdmin || !isDrawerItemDismissed(r))) {
                    const key = getDrawerKey(r) + '__' + (r.status || 'PENDING');
                    if (!seenDrawerReqKeys.has(key) && !seenDrawerReqKeys.has(r.id)) {
                        seenDrawerReqKeys.add(key);
                        seenDrawerReqKeys.add(r.id);
                        combinedRequests.push(r);
                    }
                }
            });
        }

        (requests || []).forEach(r => {
            if (r && (!isAdmin || !isDrawerItemDismissed(r))) {
                const key = getDrawerKey(r) + '__' + (r.status || 'PENDING');
                if (!seenDrawerReqKeys.has(key) && !seenDrawerReqKeys.has(r.id)) {
                    seenDrawerReqKeys.add(key);
                    seenDrawerReqKeys.add(r.id);
                    combinedRequests.push(r);
                }
            }
        });

        // Connect all historical & active checkout requests from backend Hardware Ledger
        if (typeof HardwareLedgerManager !== 'undefined' && typeof HardwareLedgerManager.getRecords === 'function') {
            const ledgerRecords = HardwareLedgerManager.getRecords();
            if (Array.isArray(ledgerRecords)) {
                ledgerRecords.forEach((rec: any) => {
                    if (!rec) return;
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
                        reviewedBy: rec.admin_approved_by || 'Vardaan Saxena'
                    };

                    if (!isAdmin && isDrawerItemDismissed(mappedReq)) return;
                    if (isAdmin && mappedReq.status === 'PENDING' && isDrawerItemDismissed(mappedReq)) return;

                    const key = getDrawerKey(mappedReq) + '__' + statusVal;
                    if (!seenDrawerReqKeys.has(key) && !seenDrawerReqKeys.has(mappedReq.id)) {
                        seenDrawerReqKeys.add(key);
                        seenDrawerReqKeys.add(mappedReq.id);
                        combinedRequests.push(mappedReq);
                    }
                });
            }
        }

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

            el.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-card-tag ${tagColor}">
                        <i data-lucide="${tagIcon}"></i>
                        <span>${tagTitle}</span>
                    </div>
                    ${statusBadge}
                </div>
                <div class="notif-card-body">
                    <p class="notif-card-main-text">
                        <strong>${bQty}x ${req.itemName}</strong> ${isReturnCard ? 'return requested by' : (status === 'APPROVED' ? 'approved & issued to' : (status === 'REJECTED' ? 'request from' : 'requested by'))} <span class="notif-user-pill">${bName}</span> (${bRoll})
                    </p>
                    <p class="notif-card-sub-text">
                        Purpose: ${req.purpose || (isReturnCard ? 'Return of hardware' : 'Lab Project')} &bull; Requested: ${req.requestedAt ? new Date(req.requestedAt).toLocaleDateString() : 'Recent'}
                        ${req.dueDate ? ` &bull; Due Date: <strong>${req.dueDate}</strong>` : ''}
                    </p>
                    ${status === 'APPROVED' ? `
                        <div class="card-request-admin-note note-approved">
                            <i data-lucide="shield-check" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                            Approved by: <strong>${reviewer}</strong>${req.reviewedAt ? ` &bull; on ${new Date(req.reviewedAt).toLocaleDateString()}` : ''}
                        </div>
                    ` : ''}
                    ${status === 'REJECTED' ? `
                        <div class="card-request-admin-note">
                            <i data-lucide="alert-circle" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                            Declined by: <strong>${reviewer}</strong>${req.reviewedAt ? ` &bull; on ${new Date(req.reviewedAt).toLocaleDateString()}` : ''}
                            ${reviewNote ? `<br>Reason: "${reviewNote}"` : ''}
                        </div>
                    ` : ''}
                    ${status === 'PENDING' ? `
                        <div class="card-request-admin-note" style="background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.25); color:#fcd34d;">
                            <i data-lucide="clock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                            Awaiting Admin Approval & OTP Verification. You will be notified via email when reviewed.
                        </div>
                    ` : ''}
                </div>
                ${actionsHtml}
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
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Submitting Request...';
        }

        const storedUser = JSON.parse(localStorage.getItem('cicr_user') || '{}');
        const userEmail = storedUser.email || (localStorage.getItem('cicr_auth')?.includes('@') ? localStorage.getItem('cicr_auth') : 'vardaansaxena096@gmail.com');

        // Route component checkout request to the Admin Portal Request Queue
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

    // Opens the return quantity selector. All users (both admins and members) choose
    // how many borrowed units to return; all requests are sent to the Admin Portal for approval.
    public static openReturnModal(rec: BorrowRecord, item: InventoryItem, origIdx: number) {
        if (!rec || !rec.id) {
            ToastManager.show('Return Unavailable', 'This loan is not linked to a server record yet.', 'warning');
            return;
        }

        // Strict ownership enforcement: only the person who issued the loan can return it
        if (!ModalManager.isUserLoanMatch(rec)) {
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

        (document.getElementById('return-borrow-id') as HTMLInputElement).value = rec.id;
        (document.getElementById('return-borrow-idx') as HTMLInputElement).value = String(origIdx);

        const qtyInput = document.getElementById('return-qty-input') as HTMLInputElement;
        qtyInput.min = '1';
        qtyInput.max = String(borrowedQty);
        qtyInput.value = String(borrowedQty);

        const maxLabel = document.getElementById('return-qty-max-label');
        if (maxLabel) maxLabel.innerText = `of ${borrowedQty} borrowed`;

        const subtitle = document.getElementById('return-modal-subtitle');
        if (subtitle) subtitle.innerText = 'Choose how many borrowed units you wish to return';

        const noteText = document.getElementById('return-modal-note-text');
        if (noteText) noteText.innerText = 'Return requests are sent to the Admin Portal for verification. Stock is checked back into inventory once approved by an administrator.';

        const submitBtn = document.getElementById('btn-confirm-return-submit') as HTMLButtonElement | null;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i data-lucide="corner-up-left"></i> Submit Return to Admin';
        }

        ModalManager.updateReturnQtyPreview();
        this.open('return-qty-modal');
        lucide.createIcons();
    }

    private static isSubmittingReturn = false;

    // Submits a full or partial return. Always hits /borrow/return-request so that
    // requests (from both admins and members) go to the Admin Portal for verification.
    public static async handleReturnSubmission(borrowId: string, qtyVal: number, _idx: number) {
        if (!borrowId || this.isSubmittingReturn) {
            if (!borrowId) ToastManager.show('Return Error', 'Borrow reference is missing.', 'error');
            return;
        }
        this.isSubmittingReturn = true;

        const isAdmin = this.getCurrentRole() === 'ADMIN';
        const token = localStorage.getItem('cicr_token');
        const submitBtn = document.getElementById('btn-confirm-return-submit') as HTMLButtonElement | null;
        const itemName = (document.getElementById('return-modal-item-name')?.innerText || 'Component').trim();
        const requestedQty = Math.max(1, Number(qtyVal) || 1);

        if (submitBtn) submitBtn.disabled = true;

        try {
            const endpoint = `${API_BASE}/borrow/return-request`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ borrowId, returnQuantity: requestedQty })
            });

            const payload = await res.json().catch(() => ({})) as any;
            const ok = res.ok || res.status === 202;

            if (!ok) {
                ToastManager.show('Return Error', payload.message || 'Failed to submit the return.', 'error');
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            this.close('return-qty-modal');

            ToastManager.show(
                'Return Request Submitted',
                `Return of ${requestedQty}x ${itemName} is awaiting Administrator approval in the Admin Portal.`,
                'success'
            );
            DatabaseManager.addLog('return', `<span>${itemName}</span> return request submitted for ${requestedQty} unit(s) — pending admin approval.`);

            // Reflect the pending return immediately in the local requests list.
            const localUser = (() => {
                try { return JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch { return {}; }
            })();
            const returnId = payload?.data?.id || `req-ret-local-${Date.now()}`;
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
            // Deduplicate: remove any existing pending return for this borrowId or id
            requests = requests.filter(r => !(r.id === returnId || (r.type === 'RETURN' && (r as any).borrowId === borrowId)));
            requests.unshift(localReq);
            DatabaseManager.save();

            await DatabaseManager.syncFromBackend();

            if (selectedItem) {
                const refreshed = inventory.find(i => i.id === selectedItem?.id);
                if (refreshed) this.openDetailModal(refreshed);
            }
            DatabaseManager.updateNotificationBadges();

            if (isAdmin) {
                AdminManager.loadHardwareRequests(true);
            }
        } catch (e) {
            console.error('Return API error:', e);
            ToastManager.show('Network Error', 'Failed to reach server.', 'error');
            if (submitBtn) submitBtn.disabled = false;
        } finally {
            this.isSubmittingReturn = false;
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
        const borrowerEmail = storedUser.email || (localStorage.getItem('cicr_auth')?.includes('@') ? localStorage.getItem('cicr_auth') : 'student@mail.jiit.ac.in');
        const rollNum = storedUser.roll_number || storedUser.roll || (borrowerEmail.includes('@') ? borrowerEmail.split('@')[0] : '');

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
        const onUserActivity = () => {
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

        // Password visibility toggles
        const loginToggle = document.getElementById('login-password-toggle')!;
        const loginPass = document.getElementById('login-password') as HTMLInputElement;
        if (loginToggle && loginPass) {
            loginToggle.addEventListener('click', () => {
                const currentType = loginPass.getAttribute('type');
                const newType = currentType === 'password' ? 'text' : 'password';
                loginPass.setAttribute('type', newType);

                const icon = loginToggle.querySelector('i')!;
                if (icon) {
                    icon.setAttribute('data-lucide', newType === 'password' ? 'eye' : 'eye-off');
                    lucide.createIcons();
                }
            });
        }

        const signupToggle = document.getElementById('signup-password-toggle')!;
        const signupPass = document.getElementById('signup-password') as HTMLInputElement;
        if (signupToggle && signupPass) {
            signupToggle.addEventListener('click', () => {
                const currentType = signupPass.getAttribute('type');
                const newType = currentType === 'password' ? 'text' : 'password';
                signupPass.setAttribute('type', newType);

                const icon = signupToggle.querySelector('i')!;
                if (icon) {
                    icon.setAttribute('data-lucide', newType === 'password' ? 'eye' : 'eye-off');
                    lucide.createIcons();
                }
            });
        }
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

        // Optimistic instant session activation: eliminates auth modal flash on page reload
        const cachedUserStr = localStorage.getItem('cicr_user');
        const cachedAuth = localStorage.getItem('cicr_auth');
        const cachedRole = (localStorage.getItem('cicr_role') as UserRole) || 'MEMBER';
        if (cachedUserStr || cachedAuth) {
            let userObj = null;
            try { if (cachedUserStr) userObj = JSON.parse(cachedUserStr); } catch { }
            const fallbackName = userObj?.name || cachedAuth || 'Operator';
            this.loginSuccess(fallbackName, cachedRole, userObj);
        }

        try {
            const res = await fetch(`${API_BASE}/auth/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const result = await res.json();
                const user = result.data;
                if (user && user.status === 'APPROVED') {
                    this.loginSuccess(user.name, user.role, user);
                    const welcomedKey = 'cicr_welcomed_' + (user.name || 'user');
                    if (!sessionStorage.getItem(welcomedKey)) {
                        sessionStorage.setItem(welcomedKey, 'true');
                        ToastManager.showWelcome(user.name, user.role);
                    }
                    return;
                }
            } else if (res.status === 401 || res.status === 403) {
                this.handleLogout();
                return;
            }
        } catch (err) {
            console.warn('Profile validation check failed (server may be waking up):', err);
        }

        if (!cachedUserStr && !cachedAuth) {
            this.handleLogout();
        }
    }

    private static showLoginOverlay() {
        this.globalNavbar.style.display = 'none';
        this.authOverlay.classList.remove('hidden');
        this.authOverlay.style.display = 'flex';
        this.appContainer.style.display = 'none';
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
        const currentAdmins = [
            'vardaansaxena096@gmail.com',
            'cicrinventory@gmail.com'
        ];
        if (currentAdmins.includes(norm)) return true;
        // JIIT student email with enrollment number or institutional domain
        return /^\d+@mail\.jiit\.ac\.in$/i.test(norm) ||
            /^[a-zA-Z0-9._%+-]+@mail\.jiit\.ac\.in$/i.test(norm) ||
            /^[a-zA-Z0-9._%+-]+@jiit\.ac\.in$/i.test(norm);
    }

    private static async handleLogin() {
        const identifier = this.loginUserInp.value.trim();
        const password = this.loginPassInp.value;

        this.loginErr.style.display = 'none';

        if (!identifier || !password) {
            this.showLoginError("Please enter your Email, Username, or Name, and Password.");
            return;
        }

        if (identifier.includes('@') && !this.isAllowedEmail(identifier)) {
            this.showLoginError("Access Restricted: Only JIIT accounts (enrollmentnumber@mail.jiit.ac.in) and authorized administrators can log in.");
            return;
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

            this.showLoginError(data.message || "Invalid credentials. Please check your email, username, or name and password.");
        } catch (err) {
            this.showLoginError("Unable to reach backend server. Please verify your connection.");
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
        const normEmail = (_userObj?.email || '').toLowerCase().trim();

        if (ModalManager.isDesignatedAdminUser(normEmail, _userObj?.name, username) || role === 'ADMIN') {
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

        // Directly transition: hide auth form, show app container
        this.authOverlay.style.display = 'none';
        this.appContainer.style.display = 'grid';

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
            AdminManager.loadUsers();
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
            this.showSignupError("Please enter your lab section batch (e.g. F1, F2, B3).");
            return;
        }

        if (password.length < 6) {
            this.showSignupError("Password must be at least 6 characters.");
            return;
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

                DatabaseManager.addLog('system', `Registration requested: <span>${name}</span> (@${username}, ${email}, Batch: ${batch}).`);

                setTimeout(() => {
                    document.getElementById('go-to-login')!.click();
                }, 2200);
                return;
            }

            this.showSignupError(data.message || "Registration failed. Please check your information.");
        } catch (err) {
            this.showSignupError("Unable to reach backend server. Please verify your connection.");
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

        const userName = user?.name || user?.username || 'Member';
        const userEmail = user?.email || 'authenticated@cicr.lab';
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

    private static handleLogout(isTimeout: boolean = false) {
        localStorage.removeItem('cicr_auth');
        localStorage.removeItem('cicr_role');
        localStorage.removeItem('cicr_token');
        localStorage.removeItem('cicr_user');
        localStorage.removeItem('cicr_last_active');
        sessionStorage.clear();

        this.updateAdminVisibility('MEMBER');

        this.appContainer.style.display = 'none';
        this.globalNavbar.style.display = 'none';

        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            welcomeScreen.style.transform = 'translateY(0)';
        }

        this.authOverlay.style.display = 'flex';
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
                const icon = currentPassToggle.querySelector('i, svg');
                if (icon) {
                    icon.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
                    lucide.createIcons();
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
                const icon = newPassToggle.querySelector('i, svg');
                if (icon) {
                    icon.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
                    lucide.createIcons();
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
                const icon = confirmPassToggle.querySelector('i, svg');
                if (icon) {
                    icon.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
                    lucide.createIcons();
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
        const currentPassword = this.currentPassInput.value;
        const newPassword = this.newPassInput.value;
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
                    loginPass.value = newPassword;
                    loginPass.focus();
                }

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

        // Attach window methods for onclick handlers
        window.openAuditDetail = (id: string) => this.openAuditDetail(id);
        window.openBulkReturnModal = () => ModalManager.openBulkReturnModal();
        window.adminApprove = (id: string) => this.approveUser(id);
        window.adminReject = (id: string) => this.rejectUser(id);
        window.adminSetRole = (id: string, role: 'ADMIN' | 'MEMBER') => this.setRole(id, role);
        window.adminDeleteUser = (id: string, name: string) => this.deleteUser(id, name);
        window.adminDeleteItem = (id: string, name: string) => this.promptDeleteItem(id, name);
        (window as any).inspectUserProfile = (info: any) => AdminManager.inspectUserProfile(info);

        window.adminApproveHardware = (id: string) => this.approveHardware(id);
        window.adminRejectHardware = (id: string) => this.rejectHardware(id);
    }

    static async loadUsers(force = false) {
        const token = localStorage.getItem('cicr_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/auth/admin/users${force ? '?force=true' : ''}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const result = await res.json();
                this.users = result.data || [];
            }
        } catch (err) {
            console.error('Failed to fetch admin users:', err);
        }

        // Ensure All Admins have full Master Admin powers in directory
        const masterDefaults: AdminUserRecord[] = [
            {
                id: 'master-vardaan',
                name: 'Vardaan Saxena',
                email: '992501030399@mail.jiit.ac.in',
                roll_number: '992501030399',
                role: 'ADMIN',
                status: 'APPROVED',
                isMasterAdmin: true,
                created_at: '2026-09-08T17:01:03.000Z'
            },
            {
                id: 'master-vardaan-owner',
                name: 'Vardaan (Owner)',
                email: 'vardaansaxena096@gmail.com',
                roll_number: null,
                role: 'ADMIN',
                status: 'APPROVED',
                isMasterAdmin: true,
                created_at: '2026-09-08T17:01:03.000Z'
            },
            {
                id: 'master-gunjan',
                name: 'Gunjan Pal',
                email: '992401210050@mail.jiit.ac.in',
                roll_number: '992401210050',
                role: 'ADMIN',
                status: 'APPROVED',
                isMasterAdmin: true,
                batch: 'Management Head',
                created_at: '2026-09-08T17:00:00.000Z'
            },
            {
                id: 'master-dhruvi',
                name: 'Dhruvi Gupta',
                email: '992401030123@mail.jiit.ac.in',
                roll_number: '992401030123',
                role: 'ADMIN',
                status: 'APPROVED',
                isMasterAdmin: true,
                batch: 'Management Head',
                created_at: '2026-09-08T17:00:00.000Z'
            },
            {
                id: 'master-aryan',
                name: 'Aryan Varshney',
                email: '992401030154@mail.jiit.ac.in',
                roll_number: '992401030154',
                role: 'ADMIN',
                status: 'APPROVED',
                isMasterAdmin: true,
                batch: 'COORDINATOR',
                created_at: '2026-09-08T17:00:00.000Z'
            },
            {
                id: 'master-cicr',
                name: 'CICR Admin',
                email: 'cicrinventory@gmail.com',
                roll_number: null,
                role: 'ADMIN',
                status: 'APPROVED',
                isMasterAdmin: true,
                created_at: '2026-09-08T17:00:01.000Z'
            }
        ];

        for (const m of masterDefaults) {
            const existing = this.users.find(u => u.email.toLowerCase() === m.email.toLowerCase());
            if (existing) {
                existing.role = 'ADMIN';
                existing.status = 'APPROVED';
                existing.isMasterAdmin = true;
                if (!existing.name || existing.name === 'Anonymous') existing.name = m.name;
                if (!existing.batch && m.batch) existing.batch = m.batch;
            } else {
                this.users.push(m);
            }
        }

        this.users.forEach(u => {
            if (u.role === 'ADMIN' || ModalManager.isDesignatedAdminUser(u.email, u.name, u.username)) {
                u.role = 'ADMIN';
                u.status = 'APPROVED';
                u.isMasterAdmin = true;
            }
        });


        this.updateStats();
        this.renderPendingQueue(force);

        const searchInput = document.getElementById('admin-users-search') as HTMLInputElement;
        const query = searchInput ? searchInput.value : '';
        this.renderUsersTable(this.filterUsers(query), force);
    }

    static getHandledRequestIds(): Set<string> {
        try {
            const raw = localStorage.getItem('cicr_dismissed_requests');
            const set = new Set<string>(raw ? JSON.parse(raw) : []);
            set.add('req_1789341756703_7d6b6494');
            return set;
        } catch {
            return new Set(['req_1789341756703_7d6b6494']);
        }
    }

    static getRequestCanonicalKey(r: any): string {
        if (!r) return '';
        const isReturn = r.type === 'RETURN' || Boolean(r.borrowId);
        if (isReturn) {
            const bId = (r.borrowId || r.id || '').trim();
            return `ret__${bId}`;
        }
        const email = (r.borrowerEmail || r.email || '').toLowerCase().trim();
        const name = (r.borrowerName || r.name || '').toLowerCase().trim();
        const itemId = (r.itemId || '').toLowerCase().trim();
        const qty = Number(r.quantity || r.qty) || 1;
        const purpose = (r.purpose || '').toLowerCase().trim();
        const reqTime = r.requestedAt ? new Date(r.requestedAt).getTime() : 0;
        const timeBucket = reqTime > 0 ? Math.floor(reqTime / 120000) : 0;
        return `iss__${email}__${name}__${itemId}__${qty}__${purpose}__${timeBucket}`;
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
        if (!token) return;

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
            }
        } catch (err) {
            console.error('Failed to fetch hardware requests:', err);
        }

        // 2. Collect from local requests state and localStorage
        const localStoredRaw = localStorage.getItem('cicr_requests');
        let localRequests: RequestRecord[] = [];
        if (localStoredRaw) {
            try { localRequests = JSON.parse(localStoredRaw); } catch { }
        }
        const combinedLocal = [...(requests || []), ...localRequests];
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
                borrowerEmail: (r as any).email || (r as any).borrowerEmail || (r.roll ? `${r.roll}@mail.jiit.ac.in` : 'student@mail.jiit.ac.in'),
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
            // Also keep local pending submissions if any
            for (const lp of localPending) {
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
            return `
            <div class="hardware-request-card glass" data-request-id="${r.id}">
                <div class="hw-card-header">
                    <div class="hw-card-chip">
                        <i data-lucide="${isReturn ? 'corner-up-left' : 'cpu'}" style="width:14px; height:14px; color:var(--neon-cyan);"></i>
                        <span class="hw-item-name">${r.itemName}</span>
                    </div>
                    <span class="hw-qty-badge">${isReturn ? 'RETURN' : 'ISSUE'} · ${isReturn ? returnQty : r.quantity}x</span>
                </div>

                <div class="hw-card-requester">
                    <div class="hw-avatar admin-user-clickable" data-user-name="${this.escapeHtml(r.borrowerName)}" data-user-email="${this.escapeHtml(r.borrowerEmail)}" data-user-roll="${this.escapeHtml(r.rollNumber || '')}" title="Inspect Member Profile">${r.borrowerName.charAt(0).toUpperCase()}</div>
                    <div class="hw-meta-col">
                        <span class="hw-requester-name admin-user-clickable" data-user-name="${this.escapeHtml(r.borrowerName)}" data-user-email="${this.escapeHtml(r.borrowerEmail)}" data-user-roll="${this.escapeHtml(r.rollNumber || '')}" title="Inspect Member Profile">${r.borrowerName}</span>
                        <span class="hw-requester-email">${r.borrowerEmail}</span>
                    </div>
                </div>

                <div class="hw-card-details">
                    ${r.rollNumber ? `<div class="hw-detail-row"><span class="hw-lbl">ROLL:</span> <span class="hw-val mono">${r.rollNumber}</span></div>` : ''}
                    ${isReturn
                    ? `<div class="hw-detail-row"><span class="hw-lbl">RETURNING:</span> <span class="hw-val">${returnQty}x ${r.itemName}</span></div>`
                    : `<div class="hw-detail-row"><span class="hw-lbl">PURPOSE:</span> <span class="hw-val">${r.purpose}</span></div>`}
                    ${isReturn ? '' : `<div class="hw-detail-row"><span class="hw-lbl">DUE DATE:</span> <span class="hw-val due">${r.dueDate || '7 Days'}</span></div>`}
                    <div class="hw-detail-row"><span class="hw-lbl">REQUESTED:</span> <span class="hw-val date">${new Date(r.requestedAt).toLocaleString()}</span></div>
                </div>

                <div class="hw-card-actions">
                    <button class="btn-hw-approve" onclick="window.adminApproveHardware('${r.id}')">
                        <i data-lucide="check"></i> ${isReturn ? 'Approve Return' : 'Approve Issue'}
                    </button>
                    <button class="btn-hw-reject" onclick="window.adminRejectHardware('${r.id}')">
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
        // Record approver on local item borrow records
        const currentAdminName = (() => {
            try {
                const u = JSON.parse(localStorage.getItem('cicr_user') || '{}');
                return u.name || u.username || 'Lab Administrator';
            } catch { return 'Lab Administrator'; }
        })();

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
                admin_approved_by: `${currentAdminName} (Admin)`,
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

        const currentAdminName = (() => {
            try {
                const u = JSON.parse(localStorage.getItem('cicr_user') || '{}');
                return u.name || u.username || 'Lab Administrator';
            } catch { return 'Lab Administrator'; }
        })();

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
            <div class="pending-request-card glass" data-user-id="${u.id}">
                <div class="pending-card-top">
                    <div class="pending-card-avatar admin-user-clickable" data-user-id="${u.id}" data-user-name="${this.escapeHtml(u.name)}" data-user-email="${this.escapeHtml(u.email)}" data-user-roll="${this.escapeHtml(u.roll_number || '')}" data-user-batch="${this.escapeHtml(u.batch || '')}" title="Inspect Profile">${u.name.charAt(0).toUpperCase()}</div>
                    <div class="pending-card-meta">
                        <span class="pending-card-name admin-user-clickable" data-user-id="${u.id}" data-user-name="${this.escapeHtml(u.name)}" data-user-email="${this.escapeHtml(u.email)}" data-user-roll="${this.escapeHtml(u.roll_number || '')}" data-user-batch="${this.escapeHtml(u.batch || '')}" title="Inspect Profile">${this.escapeHtml(u.name)}</span>
                        <span class="pending-card-email">${this.escapeHtml(u.email)}</span>
                    </div>
                </div>
                <div class="pending-card-extra">
                    <span><i data-lucide="calendar" style="width:11px; height:11px; vertical-align:middle;"></i> ${dt.dateStr}${dt.timeStr ? ` • ${dt.timeStr}` : ''}</span>
                    ${u.roll_number ? `<span>• Roll: ${this.escapeHtml(u.roll_number)}</span>` : ''}
                    <span>• Branch: ${this.escapeHtml(getStudentBranch(u.roll_number, u.batch))}</span>
                </div>
                <div class="pending-card-actions">
                    <button class="btn-approve" onclick="window.adminApprove('${u.id}')">
                        <i data-lucide="check"></i> Approve
                    </button>
                    <button class="btn-reject" onclick="window.adminReject('${u.id}')">
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

        const allAdmins = this.users.filter(u => u.isMasterAdmin || u.role === 'ADMIN' || ModalManager.isDesignatedAdminUser(u.email, u.name, u.username));
        const allMembers = this.users.filter(u => !(u.isMasterAdmin || u.role === 'ADMIN' || ModalManager.isDesignatedAdminUser(u.email, u.name, u.username)));

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
        const adminUsers = usersList.filter(u => u.isMasterAdmin || u.role === 'ADMIN' || ModalManager.isDesignatedAdminUser(u.email, u.name, u.username));
        const memberUsers = usersList.filter(u => !(u.isMasterAdmin || u.role === 'ADMIN' || ModalManager.isDesignatedAdminUser(u.email, u.name, u.username)));

        const renderRow = (u: AdminUserRecord): string => {
            const statusClass = u.status === 'APPROVED' ? 'approved' : u.status === 'PENDING' ? 'pending' : 'rejected';
            const isMaster = u.isMasterAdmin || u.role === 'ADMIN' || ModalManager.isDesignatedAdminUser(u.email, u.name, u.username);

            // Format registration date & time in 2 separate lines
            const dt = DashboardManager.formatLogDateTime(u.created_at);
            const dateHtml = `
                <div class="user-reg-date-wrap">
                    <span class="user-reg-date">${dt.dateStr}</span>
                    <span class="user-reg-time"><i data-lucide="clock"></i>${dt.timeStr || '--:--'}</span>
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
            } else if (u.email.toLowerCase() === 'mahakkatahara.mk@gmail.com') {
                const deleteBtn = `<button class="btn-table-action btn-del" onclick="window.adminDeleteUser('${u.id}', '${this.escapeHtml(u.name)}')" title="Permanently Delete User"><i data-lucide="trash-2"></i></button>`;
                actionsHtml = `<span class="badge-member-only">MEMBER ONLY</span> ${deleteBtn}`;
            } else {
                const roleBtn = u.role === 'ADMIN'
                    ? `<button class="btn-table-action btn-demote" onclick="window.adminSetRole('${u.id}', 'MEMBER')" title="Demote to Member"><i data-lucide="shield-off"></i> Demote</button>`
                    : `<button class="btn-table-action btn-make-admin" onclick="window.adminSetRole('${u.id}', 'ADMIN')" title="Promote to Admin"><i data-lucide="shield-alert"></i> Make Admin</button>`;

                const deleteBtn = `<button class="btn-table-action btn-del" onclick="window.adminDeleteUser('${u.id}', '${this.escapeHtml(u.name)}')" title="Permanently Delete User"><i data-lucide="trash-2"></i></button>`;

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
        const displayEmail = matchedUser?.email || data.email || 'student@mail.jiit.ac.in';
        const displayRoll = matchedUser?.roll_number || data.roll || (displayEmail.includes('@') ? displayEmail.split('@')[0] : '—');
        const displayBranch = getStudentBranch(displayRoll, matchedUser?.batch || data.batch);
        const displayRole = matchedUser?.role || (ModalManager.isDesignatedAdminUser(displayEmail, displayName) ? 'ADMIN' : 'MEMBER');
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
        if (!token) return;

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
            lucide.createIcons();
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
                <div class="audit-log-card ${cardCat}" onclick="window.openAuditDetail('${log.id}')" title="Click to view raw event telemetry metadata">
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
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        adminApprove?: (id: string) => void;
        adminReject?: (id: string) => void;
        adminSetRole?: (id: string, role: 'ADMIN' | 'MEMBER') => void;
        adminDeleteUser?: (id: string, name: string) => void;
        adminDeleteItem?: (id: string, name: string) => void;
        adminApproveHardware?: (id: string) => void;
        adminRejectHardware?: (id: string) => void;
        openAuditDetail?: (id: string) => void;
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
    }

    public static async syncFromBackend() {
        const token = localStorage.getItem('cicr_token');
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/auth/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
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
                    this.render(false);
                }
            }
        } catch (e) {
            console.warn('[ProfileView] Backend profile fetch notice:', e);
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
        const email = (user.email || (roll ? `${roll}@mail.jiit.ac.in` : '')).trim() || 'operator@mail.jiit.ac.in';
        const branch = getStudentBranch(roll, user.branch || user.batch);
        const userId = user.id ? `#${String(user.id).substring(0, 8)}` : `#${roll || 'JIIT-09'}`;

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
        if (heroName) {
            heroName.textContent = name;
        }

        const heroHandle = document.getElementById('profile-hero-handle');
        if (heroHandle) {
            heroHandle.textContent = `@${username}`;
        }

        const heroEmail = document.getElementById('profile-hero-email');
        if (heroEmail) {
            heroEmail.textContent = email;
        }

        const heroRollTag = document.getElementById('profile-hero-roll-text');
        if (heroRollTag) {
            heroRollTag.textContent = roll ? `Roll No: ${roll}` : 'Roll: JIIT Member';
        }

        const heroBranchTag = document.getElementById('profile-hero-branch-text');
        if (heroBranchTag) {
            heroBranchTag.textContent = branch ? `Branch: ${branch}` : 'Branch: CSE';
        }

        // Role & Status Badges
        const roleBadgeText = document.getElementById('profile-badge-role-text');
        if (roleBadgeText) {
            roleBadgeText.textContent = role === 'ADMIN' ? 'SYSADMIN' : 'MEMBER';
        }

        const roleBadge = document.getElementById('profile-hero-role-badge');
        if (roleBadge) {
            if (role === 'ADMIN') {
                roleBadge.classList.add('badge-role-admin');
            } else {
                roleBadge.classList.remove('badge-role-admin');
            }
        }

        const statusBadgeText = document.getElementById('profile-badge-status-text');
        if (statusBadgeText) {
            statusBadgeText.textContent = role === 'ADMIN' ? 'VAULT SUPERVISOR' : 'VERIFIED OPERATOR';
        }

        const idBadgeText = document.getElementById('profile-badge-id-text');
        if (idBadgeText) {
            idBadgeText.textContent = `UID: ${userId}`;
        }

        // Institutional Credentials
        const credName = document.getElementById('cred-full-name');
        if (credName) credName.textContent = name;

        const credRoll = document.getElementById('cred-roll-no');
        if (credRoll) credRoll.textContent = roll || 'Not Linked';

        const credUser = document.getElementById('cred-username');
        if (credUser) credUser.textContent = `@${username}`;

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
                    if (rec.returned) {
                        totalReturnedCount += (rec.qty || (rec as any).quantity || 1);
                    } else {
                        activeLoans.push({ item, rec, origIdx: idx });
                    }
                }
            });
        });

        const MAX_LOAN_QUOTA = 5;
        const activeCount = activeLoans.length;

        // Metric: Active Loans
        const metricActiveCount = document.getElementById('profile-metric-active-count');
        if (metricActiveCount) metricActiveCount.textContent = String(activeCount);

        const quotaPill = document.getElementById('profile-loans-quota-pill');
        if (quotaPill) quotaPill.textContent = `${activeCount} / ${MAX_LOAN_QUOTA} Used`;

        const progressFill = document.getElementById('profile-loan-progress-fill');
        if (progressFill) {
            const pct = Math.min(100, Math.round((activeCount / MAX_LOAN_QUOTA) * 100));
            progressFill.style.width = `${pct}%`;
            if (activeCount >= MAX_LOAN_QUOTA) {
                progressFill.style.background = 'var(--neon-pink)';
            } else {
                progressFill.style.background = 'var(--neon-cyan)';
            }
        }

        // Metric: Return History
        const metricHistory = document.getElementById('profile-metric-history-count');
        if (metricHistory) metricHistory.textContent = String(totalReturnedCount);

        // Metric: Account Standing
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
                metricStanding.className = 'metric-value text-pink';
            } else {
                metricStanding.textContent = 'Clear';
                metricStanding.className = 'metric-value text-green';
            }
        }

        // Metric: Vault Clearance
        const metricClearance = document.getElementById('profile-metric-clearance');
        const clearancePill = document.getElementById('profile-clearance-pill');
        const clearanceSub = document.getElementById('profile-clearance-sub');
        if (metricClearance) {
            if (role === 'ADMIN') {
                metricClearance.textContent = 'SYSADMIN';
                if (clearancePill) clearancePill.textContent = 'Tier 4';
                if (clearanceSub) clearanceSub.textContent = 'Full lab telemetry & vault write access';
            } else {
                metricClearance.textContent = 'OPERATOR';
                if (clearancePill) clearancePill.textContent = 'Tier 1';
                if (clearanceSub) clearanceSub.textContent = 'Standard hardware checkout access';
            }
        }

        // Active Loans List Heading Badge
        const activeLoansBadge = document.getElementById('profile-active-loans-badge');
        if (activeLoansBadge) {
            activeLoansBadge.textContent = `${activeCount} Active ${activeCount === 1 ? 'Loan' : 'Loans'}`;
        }

        // Render Active Loans
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
                            <i data-lucide="box"></i>
                            <span>Explore Inventory Vault</span>
                        </button>
                    </div>
                `;
                const browseBtn = document.getElementById('profile-browse-vault-btn');
                if (browseBtn) {
                    browseBtn.addEventListener('click', () => {
                        if ((window as any).dashboard && (window as any).dashboard.switchSection) {
                            (window as any).dashboard.switchSection('inventory-view');
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
                        const targetItem = inventory.find(i => String(i.id) === String(itemId));
                        if (targetItem && targetItem.borrowedBy && targetItem.borrowedBy[origIdx]) {
                            ModalManager.openReturnModal(targetItem.borrowedBy[origIdx], targetItem, origIdx);
                        }
                    });
                });
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
            emailInput.value = email || 'student@mail.jiit.ac.in';
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
                            adminApprover = 'Vardaan Saxena';
                        } else if (!adminApprover.toLowerCase().includes('admin') && !adminApprover.toLowerCase().includes('awaiting')) {
                            adminApprover = `${adminApprover} (Admin)`;
                        }
                        localRecords.push({
                            id: b.id || `local-${item.id}-${idx}`,
                            component_id: item.id,
                            component_name: item.name,
                            category: item.category || 'Component',
                            borrower_name: borrower,
                            borrower_email: b.userEmail || b.email || (b.userRoll ? `${b.userRoll}@mail.jiit.ac.in` : 'operator@mail.jiit.ac.in'),
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
                    adminApprover = isPending ? 'Awaiting Admin Review' : 'Vardaan Saxena';
                } else if (!adminApprover.toLowerCase().includes('admin') && !adminApprover.toLowerCase().includes('awaiting')) {
                    adminApprover = `${adminApprover} (Admin)`;
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

                allRecords = allRecords.filter(r => {
                    const bEmail = (r.borrower_email || '').toLowerCase().trim();
                    const bRoll = (r.borrower_roll || '').toLowerCase().trim();
                    const bName = (r.borrower_name || '').toLowerCase().trim();

                    return (myEmail && bEmail === myEmail) ||
                           (myRoll && bRoll === myRoll) ||
                           (myName && bName === myName);
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
            const timeStr = rawDate
                ? rawDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
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

            const approverName = r.admin_approved_by || (isPending ? 'Awaiting Admin Review' : 'Vardaan Saxena');

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
                            <div class="hw-borrower-top">
                                <a href="#" class="admin-user-clickable hw-borrower-name" data-user-name="${AdminManager.escapeHtml(r.borrower_name)}" data-user-email="${AdminManager.escapeHtml(r.borrower_email)}" data-user-roll="${AdminManager.escapeHtml(r.borrower_roll)}" title="Inspect Member Profile">${AdminManager.escapeHtml(r.borrower_name)}</a>
                                <span class="hw-roll-badge">${AdminManager.escapeHtml(r.borrower_roll || 'JIIT')}</span>
                            </div>
                            <span class="hw-borrower-email">${AdminManager.escapeHtml(r.borrower_email || '')}</span>
                        </div>
                    </td>

                    <!-- Approved By (Admin) -->
                    <td>
                        <div class="hw-td-admin">
                            <div class="hw-admin-badge-pill">
                                <i data-lucide="${isPending ? 'clock' : 'shield-check'}"></i>
                                <span class="hw-admin-name">${AdminManager.escapeHtml(approverName)}</span>
                            </div>
                            <span class="hw-admin-role-tag">${isPending ? 'PENDING APPROVAL' : 'VERIFIED ADMIN'}</span>
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

                    <!-- Time -->
                    <td>
                        <span class="hw-time-val"><i data-lucide="clock"></i> ${timeStr}</span>
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

    public static init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        try {
            const stored = localStorage.getItem('cicr_read_notifs');
            if (stored) {
                this.readIds = new Set(JSON.parse(stored));
            }
        } catch {}

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
                (window as any).switchSection?.('hardware-logs-view');
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
        let currentUser: any = {};
        try { currentUser = JSON.parse(localStorage.getItem('cicr_user') || '{}'); } catch {}
        const authName = localStorage.getItem('cicr_auth') || '';
        const userEmail = (currentUser.email || '').toLowerCase().trim();
        const userRoll = (currentUser.roll_number || currentUser.roll || '').toLowerCase().trim();
        const userName = (currentUser.name || currentUser.username || authName || '').toLowerCase().trim();
        const isAdmin = ModalManager.getCurrentRole() === 'ADMIN';

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

        const combinedReqs = [...(requests || []), ...localRequests];
        const seenReqIds = new Set<string>();

        if (isAdmin) {
            combinedReqs.forEach((req: any) => {
                if (!req || !req.id || seenReqIds.has(String(req.id))) return;
                seenReqIds.add(String(req.id));

                if (req.status === 'PENDING') {
                    const reqTime = req.requestedAt ? new Date(req.requestedAt).getTime() : Date.now();
                    const notifId = `req-admin-${req.id}`;
                    notifs.push({
                        id: notifId,
                        type: 'admin_alert',
                        title: 'New Hardware Request',
                        message: `${req.name || 'Student'} requested ${req.qty || 1}x ${req.itemName || 'item'}`,
                        time: this.formatRelativeTime(reqTime),
                        timestamp: reqTime,
                        unread: !this.readIds.has(notifId),
                        linkAction: () => {
                            (window as any).switchSection?.('admin-view');
                            setTimeout(() => {
                                const tab = document.querySelector('[data-tab="tab-hardware-requests"]') as HTMLElement;
                                if (tab) tab.click();
                            }, 100);
                        }
                    });
                }
            });
        } else {
            combinedReqs.forEach((req: any) => {
                if (!req || !req.id || seenReqIds.has(String(req.id))) return;
                seenReqIds.add(String(req.id));

                const reqEmail = (req.email || req.borrowerEmail || '').toLowerCase();
                const reqRoll = (req.roll || '').toLowerCase();
                const reqName = (req.name || '').toLowerCase();

                const isMyReq = (userEmail && reqEmail === userEmail) ||
                                (userRoll && reqRoll === userRoll) ||
                                (userName && reqName === userName);

                if (isMyReq) {
                    const reqTime = req.requestedAt ? new Date(req.requestedAt).getTime() : Date.now();
                    const status = (req.status || 'PENDING').toUpperCase();
                    const notifId = `my-req-${req.id}`;
                    notifs.push({
                        id: notifId,
                        type: status === 'APPROVED' ? 'issued' : 'request',
                        title: status === 'APPROVED' ? 'Request Approved' : 'Request In Review',
                        message: status === 'APPROVED'
                            ? `Your request for ${req.itemName} was approved and issued!`
                            : `Request for ${req.qty || 1}x ${req.itemName} is awaiting admin approval.`,
                        time: this.formatRelativeTime(reqTime),
                        timestamp: reqTime,
                        unread: !this.readIds.has(notifId),
                        linkAction: () => {
                            (window as any).switchSection?.('hardware-logs-view');
                        }
                    });
                }
            });
        }

        // 2. Active Loans & Returns from inventory
        if (Array.isArray(inventory)) {
            const now = Date.now();
            inventory.forEach((item: any) => {
                (item.borrowedBy || []).forEach((b: any, idx: number) => {
                    const borrowerEmail = (b.userEmail || b.email || '').toLowerCase();
                    const borrowerRoll = (b.userRoll || b.roll || '').toLowerCase();
                    const borrowerName = (b.userName || b.borrowerName || b.name || '').toLowerCase();

                    const isMine = (userEmail && borrowerEmail === userEmail) ||
                                   (userRoll && borrowerRoll === userRoll) ||
                                   (userName && borrowerName === userName);

                    if (isAdmin || isMine) {
                        const isReturned = b.returned || b.status === 'RETURNED';
                        const loanTime = b.date ? new Date(b.date).getTime() : Date.now();
                        const loanId = b.id || `${item.id}-${idx}`;

                        if (isReturned) {
                            const notifId = `ret-${loanId}`;
                            notifs.push({
                                id: notifId,
                                type: 'returned',
                                title: isMine ? 'Return Verified' : 'Return Logged',
                                message: isMine
                                    ? `${item.name} (${b.qty || 1} units) return has been verified.`
                                    : `${b.userName || 'Member'} returned ${item.name}`,
                                time: this.formatRelativeTime(loanTime),
                                timestamp: loanTime,
                                unread: !this.readIds.has(notifId),
                                linkAction: () => {
                                    (window as any).switchSection?.('hardware-logs-view');
                                }
                            });
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
                                            title: 'Return Due Soon',
                                            message: `${item.name} is due within 48 hours (${new Date(b.dueDate).toLocaleDateString()}).`,
                                            time: 'Action Required',
                                            timestamp: dueTime,
                                            unread: !this.readIds.has(dueNotifId),
                                            linkAction: () => {
                                                (window as any).switchSection?.('hardware-logs-view');
                                            }
                                        });
                                    } else if (diffHours <= 0) {
                                        const overdueNotifId = `overdue-${loanId}`;
                                        notifs.push({
                                            id: overdueNotifId,
                                            type: 'due',
                                            title: 'Component Overdue',
                                            message: `${item.name} is overdue! Please return to robotics lab.`,
                                            time: 'Overdue',
                                            timestamp: dueTime,
                                            unread: !this.readIds.has(overdueNotifId),
                                            linkAction: () => {
                                                (window as any).switchSection?.('hardware-logs-view');
                                            }
                                        });
                                    }
                                }
                            }

                            const loanNotifId = `loan-${loanId}`;
                            notifs.push({
                                id: loanNotifId,
                                type: 'issued',
                                title: isMine ? 'Component Issued' : 'Loan Recorded',
                                message: isMine
                                    ? `${item.name} (${b.qty || 1} units) issued to you.`
                                    : `${item.name} issued to ${b.userName || 'Member'}`,
                                time: this.formatRelativeTime(loanTime),
                                timestamp: loanTime,
                                unread: !this.readIds.has(loanNotifId),
                                linkAction: () => {
                                    (window as any).switchSection?.('hardware-logs-view');
                                }
                            });
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
        const notifs = this.getPersonalizedNotifications();
        const unreadCount = notifs.filter(n => n.unread).length;

        const badge = document.getElementById('header-notif-badge');
        const dot = document.getElementById('header-notif-dot');

        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = String(unreadCount);
                badge.style.display = 'inline-flex';
            } else {
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
        const notifs = this.getPersonalizedNotifications();
        notifs.forEach(n => this.readIds.add(n.id));
        localStorage.setItem('cicr_read_notifs', JSON.stringify(Array.from(this.readIds)));
        this.updateNotifications();
        this.renderDropdown();
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
    }

    public static applyTheme(theme: string) {
        // Fallback / sanitize: only 'mono' and 'light' exist
        if (theme !== 'light' && theme !== 'mono') {
            theme = 'mono';
        }

        // 1. Temporarily freeze transitions to eliminate multi-element transition lag & compositor flickering
        const lockId = 'cicr-theme-lock-style';
        let lockStyle = document.getElementById(lockId) as HTMLStyleElement | null;
        if (!lockStyle) {
            lockStyle = document.createElement('style');
            lockStyle.id = lockId;
            lockStyle.textContent = `*, *::before, *::after {
                -webkit-transition: none !important;
                -moz-transition: none !important;
                -o-transition: none !important;
                -ms-transition: none !important;
                transition: none !important;
            }`;
            document.head.appendChild(lockStyle);
        }

        // 2. Batch attribute and class updates synchronously
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.remove('theme-light', 'theme-mono');
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem('cicr_vault_theme', theme);
        localStorage.setItem('cicr_theme', theme);

        if (this.themeSelectEl && this.themeSelectEl.value !== theme) {
            this.themeSelectEl.value = theme;
        }
        if (this.navThemeSelectEl && this.navThemeSelectEl.value !== theme) {
            this.navThemeSelectEl.value = theme;
        }
        if (this.headerThemeSelectEl && this.headerThemeSelectEl.value !== theme) {
            this.headerThemeSelectEl.value = theme;
        }

        // Sync sidebar theme buttons if present
        const themeBtnLight = document.getElementById('theme-btn-light');
        const themeBtnMono = document.getElementById('theme-btn-mono');
        [themeBtnLight, themeBtnMono].forEach(b => b?.classList.remove('active'));
        if (theme === 'light') themeBtnLight?.classList.add('active');
        else if (theme === 'mono') themeBtnMono?.classList.add('active');

        if (window.bg3D) {
            window.bg3D.updateThemeColors(theme);
        }

        // Force browser to commit style changes synchronously without animation
        void window.getComputedStyle(document.body).backgroundColor;

        // 3. Remove transition freeze on next frame for buttery smooth user interactions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = document.getElementById(lockId);
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        });
    }
}

// ==========================================
// 7. Application Bootstrap
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    window.bg3D = new Background3D();
    ThemeManager.init();
    DatabaseManager.init();
    ModalManager.init();
    PasswordResetManager.init();
    TeamShowcaseManager.init();
    ProfileViewManager.init();
    ProfileEditManager.init();
    HardwareLedgerManager.init();
    NotificationCenterManager.init();

    AuthManager.init();
    AdminManager.init();
    AdminManager.loadHardwareRequests(true);
    DatabaseManager.updateNotificationBadges();
    DatabaseManager.startAutoSync(45000);
    lucide.createIcons();

    // Global mouse-coordinate spotlight tracker for interactive cyber gridlines (requestAnimationFrame throttled)
    let mouseMoveTicking = false;
    document.addEventListener('mousemove', (e) => {
        if (!mouseMoveTicking) {
            requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth) * 100;
                const y = (e.clientY / window.innerHeight) * 100;
                document.documentElement.style.setProperty('--mouse-x', `${x}%`);
                document.documentElement.style.setProperty('--mouse-y', `${y}%`);
                mouseMoveTicking = false;
            });
            mouseMoveTicking = true;
        }
    }, { passive: true });

    // Custom 3D tilt interaction logic for desktop interactivity
    const apply3DTilt = (el: HTMLElement, maxRotation: number = 6) => {
        el.addEventListener('mousemove', (e) => {
            if (window.innerWidth < 768) return; // Only apply on desktop
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -maxRotation;
            const rotateY = ((x - centerX) / centerX) * maxRotation;

            el.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;
            el.style.transition = 'transform 0.1s ease-out';
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            el.style.transition = 'transform 0.5s ease';
        });
    };

    const heroCard = document.getElementById('team-hero-card');
    if (heroCard) {
        apply3DTilt(heroCard, 5);
    }





    // High-performance scroll state manager without DOM class thrashing
    let scrollDebounceTimer: number | undefined;
    window.addEventListener('scroll', () => {
        (window as any).isUserScrolling = true;
        if (scrollDebounceTimer !== undefined) {
            clearTimeout(scrollDebounceTimer);
        }
        scrollDebounceTimer = window.setTimeout(() => {
            (window as any).isUserScrolling = false;
            if ((window as any)._pendingDashboardRender && window.dashboard) {
                (window as any)._pendingDashboardRender = false;
                window.dashboard.renderStats();
                window.dashboard.renderInventory();
            }
        }, 150);
    }, { passive: true });

    // IntersectionObserver scroll reveal triggers matching Pinterest visual transition
    const revealElements = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.08,
        rootMargin: '0px 0px -60px 0px'
    });
    revealElements.forEach(el => observer.observe(el));

    // Real-Time Sidebar Alignment Sync (Desktop Viewport-Fixed Positioning)
    const syncFixedSidebarPosition = () => {
        const container = document.getElementById('app-container');
        const sidebar = document.getElementById('app-sidebar');
        if (!container || !sidebar || window.innerWidth <= 1100) {
            document.documentElement.style.removeProperty('--sidebar-fixed-left');
            return;
        }
        const containerRect = container.getBoundingClientRect();
        // 20px aligns precisely with container's horizontal padding
        const targetLeft = Math.round(containerRect.left + 20);
        document.documentElement.style.setProperty('--sidebar-fixed-left', `${targetLeft}px`);
    };

    (window as any).syncFixedSidebarPosition = syncFixedSidebarPosition;
    window.addEventListener('resize', syncFixedSidebarPosition, { passive: true });
    window.addEventListener('orientationchange', syncFixedSidebarPosition, { passive: true });
    syncFixedSidebarPosition();

    if (typeof ResizeObserver !== 'undefined') {
        const container = document.getElementById('app-container');
        if (container) {
            const ro = new ResizeObserver(() => syncFixedSidebarPosition());
            ro.observe(container);
        }
    }
});
