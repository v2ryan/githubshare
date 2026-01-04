import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// --- FIREBASE CONFIGURATION ---
// USER: Replace this with your own config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyCi7WRRDCwOQHyKS8j-ypTPfXnYG6g9aco",
    authDomain: "ailesson-bd06b.firebaseapp.com",
    databaseURL: "https://ailesson-bd06b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ailesson-bd06b",
    storageBucket: "ailesson-bd06b.firebasestorage.app",
    messagingSenderId: "692911516130",
    appId: "1:692911516130:web:26ca6a4d8fa5ef8749b1bb",
    measurementId: "G-4WSSWC8LV3"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const linksCol = collection(db, 'links');

// --- STATE ---
let isAdmin = false;
let currentAction = null; // { type: 'edit'|'delete'|'admin', id: string, data: any }
let editingId = null;

// --- DOM ELEMENTS ---
const linksBody = document.getElementById('links-body');
const addModal = document.getElementById('add-modal');
const authModal = document.getElementById('auth-modal');
const addBtn = document.getElementById('add-btn');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const adminIndicator = document.getElementById('admin-indicator');

// Forms
const inputName = document.getElementById('input-name');
const inputUrl = document.getElementById('input-url');
const inputLearn = document.getElementById('input-learn');
const inputPassword = document.getElementById('input-password');
const authPassword = document.getElementById('auth-password');
const authTitle = document.getElementById('auth-title');
const authDesc = document.getElementById('auth-desc');

// --- RENDER ---
onSnapshot(query(linksCol, orderBy('createdAt', 'desc')), (snapshot) => {
    linksBody.innerHTML = '';
    if (snapshot.empty) {
        linksBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94a3b8;">暫無記錄，請點擊上方按鈕新增！</td></tr>';
        return;
    }
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        const row = document.createElement('tr');

        row.innerHTML = `
            <td><span class="mobile-label">人名</span>${data.name}</td>
            <td><span class="mobile-label">網頁</span><a href="${data.url}" target="_blank" class="github-link"><i class="fas fa-external-link-alt"></i> ${data.url}</a></td>
            <td><span class="mobile-label">想學的項目</span>${data.learn || '-'}</td>
            <td class="actions">
                <span class="mobile-label">操作</span>
                <button class="action-btn edit-trigger" data-id="${id}" title="編輯"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete delete-trigger" data-id="${id}" title="刪除"><i class="fas fa-trash"></i></button>
            </td>
        `;
        linksBody.appendChild(row);
    });

    // Re-bind listeners
    document.querySelectorAll('.edit-trigger').forEach(btn => btn.onclick = () => handleEdit(btn.dataset.id));
    document.querySelectorAll('.delete-trigger').forEach(btn => btn.onclick = () => handleDelete(btn.dataset.id));
}, (error) => {
    console.error("讀取失敗:", error);
    if (error.code === 'permission-denied') {
        linksBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #ef4444;">權限不足：請檢查 Firebase 安全規則 (Security Rules) 是否已設為公開 (Test Mode)。</td></tr>';
    } else {
        linksBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #ef4444;">連接失敗：${error.message}</td></tr>`;
    }
});

// --- ACTIONS ---

async function saveNewEntry() {
    const name = inputName.value.trim();
    const url = inputUrl.value.trim();
    const learn = inputLearn.value.trim();
    const password = inputPassword.value;
    const saveBtn = document.getElementById('save-new');

    if (!password) {
        alert('請至少設置編輯密碼。');
        return;
    }

    // Optimistic UI: Close immediately
    closeModals();
    clearInputs();

    if (editingId) {
        // UPDATE Existing
        updateDoc(doc(db, 'links', editingId), {
            name,
            url,
            learn,
            password,
            updatedAt: new Date()
        }).catch((e) => {
            console.error("更新失敗: ", e);
            alert("更新失敗，請檢查網路連接或稍後再試。\n" + e.message);
        });
    } else {
        // ADD New
        addDoc(linksCol, {
            name,
            url,
            learn,
            password, // 在實際應用中應進行加密 (Hash)
            createdAt: new Date()
        }).catch((e) => {
            console.error("儲存失敗: ", e);
            alert("儲存失敗，請檢查網路連接或稍後再試。\n" + e.message);
        });
    }
}

async function handleEdit(id) {
    if (isAdmin) {
        performEdit(id);
    } else {
        openAuthModal('編輯條目', '請輸入建立時設置的密碼以進行核准。', 'edit', id);
    }
}

async function handleDelete(id) {
    if (isAdmin) {
        if (confirm('確定要刪除此條目嗎？')) await deleteDoc(doc(db, 'links', id));
    } else {
        openAuthModal('刪除條目', '請輸入密碼或管理員密碼以進行核准。', 'delete', id);
    }
}

async function verifyAction() {
    const password = authPassword.value;
    const { type, id } = currentAction;

    if (type === 'admin') {
        if (password === '65775833') { // 提示：請修改此預設密碼
            setAdminStatus(true);
            closeModals();
        } else {
            alert('管理員密碼錯誤');
        }
        return;
    }

    // 行特定密碼檢查
    const docRef = doc(db, 'links', id);
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().password === password) {
        if (type === 'delete') {
            if (confirm('核准成功。確定要刪除嗎？')) {
                await deleteDoc(docRef);
                closeModals();
            }
        } else if (type === 'edit') {
            // Open Edit Modal with Pre-filled Data
            editingId = id;
            inputName.value = snap.data().name || '';
            inputUrl.value = snap.data().url || '';
            inputLearn.value = snap.data().learn || '';
            inputPassword.value = snap.data().password || ''; // Pre-fill proper password

            document.getElementById('modal-title-entry').innerText = '編輯條目';
            document.getElementById('save-new').innerText = '更新條目';
            addModal.classList.remove('hidden');

            closeAuthModals(); // Close auth modal only
        }
    } else {
        alert('密碼不正確');
    }
}

// --- UI 助手 ---

function openAuthModal(title, desc, type, id) {
    authTitle.innerText = title;
    authDesc.innerText = desc;
    currentAction = { type, id };
    authModal.classList.remove('hidden');
    authPassword.focus();
}

function setAdminStatus(status) {
    isAdmin = status;
    adminIndicator.classList.toggle('hidden', !status);
    adminLoginBtn.classList.toggle('hidden', status);
    adminLogoutBtn.classList.toggle('hidden', !status);
}

function closeModals() {
    addModal.classList.add('hidden');
    authModal.classList.add('hidden');
    authPassword.value = '';
    editingId = null; // Reset edit state on close
}

function closeAuthModals() {
    authModal.classList.add('hidden');
    authPassword.value = '';
}

function clearInputs() {
    inputName.value = '';
    inputUrl.value = '';
    inputLearn.value = '';
    inputPassword.value = '';
}

// --- 事件監聽器 ---

addBtn.onclick = () => {
    editingId = null;
    clearInputs();
    document.getElementById('modal-title-entry').innerText = '新增條目';
    document.getElementById('save-new').innerText = '儲存條目';
    addModal.classList.remove('hidden');
};
document.getElementById('cancel-add').onclick = closeModals;
document.getElementById('save-new').onclick = saveNewEntry;

adminLoginBtn.onclick = () => openAuthModal('管理權限', '請輸入管理員密碼以獲得完全控制權。', 'admin', null);
adminLogoutBtn.onclick = () => setAdminStatus(false);
document.getElementById('cancel-auth').onclick = closeModals;
document.getElementById('verify-auth').onclick = verifyAction;

authPassword.onkeyup = (e) => { if (e.key === 'Enter') verifyAction(); };
