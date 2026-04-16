import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, AlertTriangleIcon, WarningIcon, ShieldIcon } from '@/assets/icons';
import './ConfirmModal.css';

// ============================================
// Context for global confirm modal management
// ============================================

const ConfirmModalContext = createContext(null);

/**
 * ConfirmModalProvider - Wrap your app to enable useConfirm hook globally
 *
 * Usage:
 * ```jsx
 * <ConfirmModalProvider>
 *   <App />
 * </ConfirmModalProvider>
 * ```
 */
export function ConfirmModalProvider({ children }) {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: null,
    onCancel: null,
    isLoading: false,
  });

  const confirm = useCallback(
    ({ title, message, variant = 'danger', confirmText = 'Confirm', cancelText = 'Cancel' }) => {
      return new Promise((resolve) => {
        setModalState({
          isOpen: true,
          title,
          message,
          variant,
          confirmText,
          cancelText,
          onConfirm: () => {
            setModalState((prev) => ({ ...prev, isOpen: false }));
            resolve(true);
          },
          onCancel: () => {
            setModalState((prev) => ({ ...prev, isOpen: false }));
            resolve(false);
          },
          isLoading: false,
        });
      });
    },
    []
  );

  const setLoading = useCallback((isLoading) => {
    setModalState((prev) => ({ ...prev, isLoading }));
  }, []);

  const closeModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ConfirmModalContext.Provider value={{ confirm, setLoading, closeModal }}>
      {children}
      {modalState.isOpen && (
        <ConfirmModal
          title={modalState.title}
          message={modalState.message}
          variant={modalState.variant}
          confirmText={modalState.confirmText}
          cancelText={modalState.cancelText}
          onConfirm={modalState.onConfirm}
          onCancel={modalState.onCancel}
          isLoading={modalState.isLoading}
        />
      )}
    </ConfirmModalContext.Provider>
  );
}

/**
 * useConfirm - Hook to trigger confirmation modals
 *
 * Usage:
 * ```jsx
 * const { confirm } = useConfirm();
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Delete Item',
 *     message: 'Are you sure you want to delete this item?',
 *     variant: 'danger',
 *     confirmText: 'Delete',
 *     cancelText: 'Cancel',
 *   });
 *
 *   if (confirmed) {
 *     // Perform delete action
 *   }
 * };
 * ```
 */
export function useConfirm() {
  const context = useContext(ConfirmModalContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmModalProvider');
  }
  return context;
}

// ============================================
// ConfirmModal Component
// ============================================

/**
 * ConfirmModal - A professional confirmation modal component
 *
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} variant - 'danger' | 'warning' | 'info' (affects colors and icon)
 * @param {string} confirmText - Text for confirm button
 * @param {string} cancelText - Text for cancel button
 * @param {function} onConfirm - Called when user confirms
 * @param {function} onCancel - Called when user cancels
 * @param {boolean} isLoading - Shows loading state on confirm button
 */
export function ConfirmModal({
  title,
  message,
  variant = 'danger',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
}) {
  const modalRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);

  // Focus trap and initial focus
  useEffect(() => {
    // Store the element that was focused before modal opened
    const previouslyFocused = document.activeElement;

    // Focus the cancel button initially (safer default for destructive actions)
    if (cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      // Restore focus when modal closes
      if (previouslyFocused && previouslyFocused.focus) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel?.();
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isLoading]);

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isLoading) {
      onCancel?.();
    }
  };

  // Get icon based on variant
  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <AlertTriangleIcon size={28} />;
      case 'warning':
        return <WarningIcon size={28} />;
      case 'info':
      default:
        return <ShieldIcon size={28} />;
    }
  };

  const modalContent = (
    <div className="confirm-modal-backdrop" onClick={handleBackdropClick} role="presentation">
      <div
        ref={modalRef}
        className={`confirm-modal confirm-modal--${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        {/* Close button */}
        <button
          className="confirm-modal__close"
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close"
          type="button"
        >
          <CloseIcon size={20} />
        </button>

        {/* Icon */}
        <div className={`confirm-modal__icon confirm-modal__icon--${variant}`}>{getIcon()}</div>

        {/* Content */}
        <div className="confirm-modal__content">
          <h2 id="confirm-modal-title" className="confirm-modal__title">
            {title}
          </h2>
          <p id="confirm-modal-message" className="confirm-modal__message">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="confirm-modal__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="confirm-modal__btn confirm-modal__btn--cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--${variant}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="confirm-modal__spinner" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level
  return createPortal(modalContent, document.body);
}

export default ConfirmModal;
