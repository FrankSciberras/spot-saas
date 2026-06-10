'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './OnboardingGuide.module.css';

interface Step {
  target?: string; // CSS selector for the element to highlight
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'none';
  actionLabel?: string;
}

interface Guide {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: Step[];
}

// Define all available guides
const GUIDES: Guide[] = [
  {
    id: 'welcome',
    name: 'Welcome Tour',
    description: 'Get started with Rovora',
    icon: '👋',
    steps: [
      {
        title: 'Welcome to Rovora!',
        content: 'This quick tour will help you get familiar with the key features. Let\'s get you set up for success!',
        position: 'center',
      },
      {
        target: '[data-tour="sidebar"]',
        title: 'Navigation Sidebar',
        content: 'Use the sidebar to navigate between different sections. You can access your roster, shifts, profile, and more.',
        position: 'right',
      },
      {
        target: '[data-tour="notifications-bell"]',
        title: 'Notifications',
        content: 'Click here to see your notifications. You\'ll be notified when new rosters are published or if there are any updates.',
        position: 'bottom',
      },
    ],
  },
  {
    id: 'push-notifications',
    name: 'Enable Push Notifications',
    description: 'Never miss an update',
    icon: '🔔',
    steps: [
      {
        title: 'Stay Updated with Push Notifications',
        content: 'Push notifications let you receive instant alerts on your device, even when you\'re not using the app. Let\'s enable them!',
        position: 'center',
      },
      {
        target: '[data-tour="profile-link"]',
        title: 'Go to Your Profile',
        content: 'First, navigate to your profile where you can manage notification settings.',
        position: 'right',
        action: 'click',
        actionLabel: 'Go to Profile',
      },
      {
        target: '[data-tour="push-toggle"]',
        title: 'Enable Push Notifications',
        content: 'Toggle this switch to enable push notifications. Your browser will ask for permission - click "Allow" when prompted.',
        position: 'top',
      },
      {
        title: 'You\'re All Set!',
        content: 'Once enabled, you\'ll receive notifications for:\n• New roster publications\n• Shift reminders\n• Important updates\n\nYou can disable them anytime from your profile.',
        position: 'center',
      },
    ],
  },
  {
    id: 'view-roster',
    name: 'View Your Roster',
    description: 'See your weekly schedule',
    icon: '📅',
    steps: [
      {
        title: 'Your Weekly Roster',
        content: 'The roster shows your assigned shifts for the week. Let\'s learn how to read it!',
        position: 'center',
      },
      {
        target: '[data-tour="roster-link"]',
        title: 'Access Your Roster',
        content: 'Click on "My Roster" in the sidebar to view your weekly schedule.',
        position: 'right',
        action: 'click',
        actionLabel: 'View Roster',
      },
      {
        target: '[data-tour="roster-week"]',
        title: 'Week Navigation',
        content: 'Use these arrows to navigate between different weeks. The current week is shown by default.',
        position: 'bottom',
      },
      {
        target: '[data-tour="roster-day"]',
        title: 'Your Shifts',
        content: 'Each day shows the vehicle you\'re assigned to. If a day is empty, you\'re not scheduled to work that day.',
        position: 'top',
      },
    ],
  },
  {
    id: 'go-online',
    name: 'Start Your Shift',
    description: 'Learn how to go online',
    icon: '🚗',
    steps: [
      {
        title: 'Starting Your Shift',
        content: 'When you\'re ready to work, you need to "go online" to start your shift. Let\'s see how!',
        position: 'center',
      },
      {
        target: '[data-tour="go-online-link"]',
        title: 'Go Online Section',
        content: 'Click "Go Online" in the sidebar when you\'re ready to start your shift.',
        position: 'right',
        action: 'click',
        actionLabel: 'Go to Go Online',
      },
      {
        title: 'Enter Starting Mileage',
        content: 'You\'ll need to enter the vehicle\'s current mileage when starting your shift. This helps track daily usage.',
        position: 'center',
      },
      {
        title: 'End Your Shift',
        content: 'When you\'re done for the day, return here to end your shift and enter the final mileage.',
        position: 'center',
      },
    ],
  },
  {
    id: 'profile-documents',
    name: 'Your Profile & Documents',
    description: 'Manage your information',
    icon: '📄',
    steps: [
      {
        title: 'Your Profile',
        content: 'Your profile contains all your personal information and important documents. Let\'s explore!',
        position: 'center',
      },
      {
        target: '[data-tour="profile-link"]',
        title: 'Access Your Profile',
        content: 'Click on "My Profile" to view and manage your information.',
        position: 'right',
        action: 'click',
        actionLabel: 'View Profile',
      },
      {
        title: 'Document Expiry Dates',
        content: 'Your profile shows expiry dates for important documents like your:\n• ID Card\n• Driving License\n• Police Conduct\n• TAG License\n\nMake sure to renew them before they expire!',
        position: 'center',
      },
      {
        title: 'View Attachments',
        content: 'You can view copies of your uploaded documents. Contact an admin if any documents need updating.',
        position: 'center',
      },
    ],
  },
  {
    id: 'install-app',
    name: 'Install the App',
    description: 'Add to your home screen',
    icon: '📲',
    steps: [
      {
        title: 'Install Rovora',
        content: 'You can install Rovora on your phone or computer for quick access and better notifications!',
        position: 'center',
      },
      {
        title: 'On iPhone/iPad',
        content: '1. Tap the Share button (square with arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm\n\nThe app icon will appear on your home screen!',
        position: 'center',
      },
      {
        title: 'On Android',
        content: '1. Tap the menu (three dots) in your browser\n2. Tap "Add to Home Screen" or "Install App"\n3. Confirm the installation\n\nThe app will work like a native app!',
        position: 'center',
      },
      {
        title: 'On Desktop',
        content: 'Look for the install icon in your browser\'s address bar, or use the browser menu to install the app.',
        position: 'center',
      },
      {
        title: 'Benefits',
        content: 'Installing the app gives you:\n• Faster loading\n• Works offline\n• Push notifications\n• Full-screen experience\n• Quick access from home screen',
        position: 'center',
      },
    ],
  },
];

// Admin-specific guides
const ADMIN_GUIDES: Guide[] = [
  {
    id: 'admin-welcome',
    name: 'Admin Dashboard Tour',
    description: 'Learn the admin features',
    icon: '👋',
    steps: [
      {
        title: 'Welcome, Admin!',
        content: 'This tour will help you understand the key management features of Rovora.',
        position: 'center',
      },
      {
        target: '[data-tour="sidebar"]',
        title: 'Navigation',
        content: 'Use the sidebar to navigate between Drivers, Vehicles, Services, Rosters, and more.',
        position: 'right',
      },
      {
        title: 'Quick Overview',
        content: 'Your dashboard shows key metrics:\n• Active drivers and vehicles\n• Pending tasks\n• Recent activity\n• Expiring documents',
        position: 'center',
      },
    ],
  },
  {
    id: 'manage-rosters',
    name: 'Create & Manage Rosters',
    description: 'Schedule driver shifts',
    icon: '📅',
    steps: [
      {
        title: 'Roster Management',
        content: 'Rosters let you assign drivers to vehicles for each day of the week. Let\'s learn how!',
        position: 'center',
      },
      {
        title: 'Create a Roster',
        content: 'Go to Rosters and click "New Roster" to create a weekly schedule.',
        position: 'center',
      },
      {
        title: 'Assign Drivers',
        content: 'For each vehicle row, select a driver from the dropdown for each day they\'ll be working.',
        position: 'center',
      },
      {
        title: 'Publish & Notify',
        content: 'When ready, click "Save & Publish" to make the roster visible to drivers. They\'ll be automatically notified!',
        position: 'center',
      },
      {
        title: 'Update Published Rosters',
        content: 'You can edit and republish rosters anytime. Drivers will be notified of changes.',
        position: 'center',
      },
    ],
  },
  {
    id: 'vehicle-services',
    name: 'Track Vehicle Services',
    description: 'Maintain your fleet',
    icon: '🔧',
    steps: [
      {
        title: 'Service Tracking',
        content: 'Keep your fleet in top condition by tracking all maintenance and services.',
        position: 'center',
      },
      {
        title: 'Add Services',
        content: 'Record each service with:\n• Service type (oil change, brakes, etc.)\n• Mileage at service\n• Next service due\n• Cost and provider',
        position: 'center',
      },
      {
        title: 'Service Alerts',
        content: 'The dashboard warns you when vehicles are approaching their next service mileage.',
        position: 'center',
      },
      {
        title: 'View on Vehicle Page',
        content: 'Each vehicle\'s page shows its full service history and next service due.',
        position: 'center',
      },
    ],
  },
  {
    id: 'notifications-admin',
    name: 'Notification System',
    description: 'Send and manage notifications',
    icon: '🔔',
    steps: [
      {
        title: 'Notification Management',
        content: 'Control how and when notifications are sent to drivers.',
        position: 'center',
      },
      {
        title: 'Automated Rules',
        content: 'Set up rules to automatically notify drivers about:\n• New rosters\n• Shift reminders\n• Document expiry\n• Vehicle service due',
        position: 'center',
      },
      {
        title: 'Send Custom Notifications',
        content: 'Send one-time announcements via:\n• Dashboard notification\n• Push notification\n• Email',
        position: 'center',
      },
      {
        title: 'View History',
        content: 'Check the history tab to see all sent notifications and their status.',
        position: 'center',
      },
    ],
  },
];

interface OnboardingGuideProps {
  userId?: string;
  isNewUser?: boolean;
  variant?: 'driver' | 'admin';
  autoStart?: boolean; // Auto-start welcome tour on first visit
}

export default function OnboardingGuide({ userId, isNewUser = false, variant = 'driver', autoStart = true }: OnboardingGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showGuideList, setShowGuideList] = useState(false);
  const [activeGuide, setActiveGuide] = useState<Guide | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedGuides, setCompletedGuides] = useState<string[]>([]);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  // Get welcome guide based on variant
  const welcomeGuide = variant === 'driver' 
    ? GUIDES.find(g => g.id === 'welcome')
    : ADMIN_GUIDES.find(g => g.id === 'admin-welcome');

  // Load completed guides from localStorage
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(`onboarding_completed_${userId || 'guest'}`);
    if (saved) {
      setCompletedGuides(JSON.parse(saved));
    }

    // Check if we need to resume a guide after navigation
    const resumeState = sessionStorage.getItem('onboarding_guide_state');
    if (resumeState) {
      try {
        const { guideId, nextStep } = JSON.parse(resumeState);
        sessionStorage.removeItem('onboarding_guide_state');
        
        // Find the guide to resume
        const allGuides = [...GUIDES, ...ADMIN_GUIDES];
        const guideToResume = allGuides.find(g => g.id === guideId);
        
        if (guideToResume && nextStep < guideToResume.steps.length) {
          setTimeout(() => {
            setActiveGuide(guideToResume);
            setCurrentStep(nextStep);
            setIsOpen(true);
          }, 500); // Small delay to let page render
          return; // Don't auto-start welcome if resuming
        }
      } catch {
        sessionStorage.removeItem('onboarding_guide_state');
      }
    }

    // Auto-start welcome tour for new users (skip the guide list)
    if (autoStart && !saved && welcomeGuide) {
      setTimeout(() => {
        setActiveGuide(welcomeGuide);
        setCurrentStep(0);
        setIsOpen(true);
      }, 800);
    }
  }, [userId, autoStart, welcomeGuide]);

  // Save completed guides to localStorage
  const markGuideComplete = useCallback((guideId: string) => {
    const updated = [...completedGuides, guideId];
    setCompletedGuides(updated);
    localStorage.setItem(`onboarding_completed_${userId || 'guest'}`, JSON.stringify(updated));
  }, [completedGuides, userId]);

  // Update highlight position for current step
  useEffect(() => {
    if (!activeGuide || !mounted) return;

    const step = activeGuide.steps[currentStep];
    if (!step) {
      // Safety check - if step doesn't exist, reset
      setHighlightRect(null);
      return;
    }

    if (step.target) {
      // Small delay to ensure DOM is ready after navigation
      const timer = setTimeout(() => {
        try {
          const element = document.querySelector(step.target!);
          if (element) {
            const rect = element.getBoundingClientRect();
            setHighlightRect(rect);
            
            // Scroll element into view if needed
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            setHighlightRect(null);
          }
        } catch {
          // querySelector might fail with invalid selectors
          setHighlightRect(null);
        }
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setHighlightRect(null);
    }
  }, [activeGuide, currentStep, mounted]);

  // Start a guide
  const startGuide = (guide: Guide) => {
    setActiveGuide(guide);
    setCurrentStep(0);
    setShowGuideList(false);
  };

  // Next step
  const nextStep = () => {
    if (!activeGuide) return;

    const step = activeGuide.steps[currentStep];
    
    // If step has click action, trigger click on target element
    if (step?.action === 'click' && step.target) {
      const element = document.querySelector(step.target) as HTMLElement;
      if (element) {
        // Store guide state before navigation
        const guideState = {
          guideId: activeGuide.id,
          nextStep: currentStep + 1,
        };
        sessionStorage.setItem('onboarding_guide_state', JSON.stringify(guideState));
        
        // Click the element to navigate
        element.click();
        return; // Don't increment step here - will resume after navigation
      }
    }

    if (currentStep < activeGuide.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Guide complete
      markGuideComplete(activeGuide.id);
      setActiveGuide(null);
      setCurrentStep(0);
      setShowGuideList(true);
    }
  };

  // Previous step
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Close guide
  const closeGuide = () => {
    setActiveGuide(null);
    setCurrentStep(0);
    setIsOpen(false);
    setShowGuideList(false);
  };

  // Get tooltip position based on step position and target rect
  const getTooltipStyle = () => {
    if (!activeGuide) return {};
    
    const step = activeGuide.steps[currentStep];
    if (!step) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    
    if (step.position === 'center' || !highlightRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const padding = 20;
    const tooltipWidth = 360;
    const tooltipHeight = 200;

    switch (step.position) {
      case 'top':
        return {
          top: `${highlightRect.top - tooltipHeight - padding}px`,
          left: `${highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2}px`,
        };
      case 'bottom':
        return {
          top: `${highlightRect.bottom + padding}px`,
          left: `${highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2}px`,
        };
      case 'left':
        return {
          top: `${highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2}px`,
          left: `${highlightRect.left - tooltipWidth - padding}px`,
        };
      case 'right':
        return {
          top: `${highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2}px`,
          left: `${highlightRect.right + padding}px`,
        };
      default:
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
    }
  };

  // Get arrow class based on position
  const getArrowClass = () => {
    if (!activeGuide) return '';
    const step = activeGuide.steps[currentStep];
    if (!step) return '';
    const pos = step.position || 'center';
    if (pos === 'center' || !highlightRect) return '';
    return styles[`arrow${pos.charAt(0).toUpperCase() + pos.slice(1)}`];
  };

  // Filter guides based on variant
  const availableGuides = variant === 'driver' 
    ? GUIDES 
    : ADMIN_GUIDES;

  if (!mounted) return null;

  return (
    <>
      {/* Help Button */}
      <button 
        className={styles.helpButton}
        onClick={() => {
          setIsOpen(true);
          setShowGuideList(true);
        }}
        title="Help & Guides"
      >
        <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {/* Portal for overlay */}
      {isOpen && mounted && createPortal(
        <div className={styles.overlay}>
          {/* Highlight box */}
          {activeGuide && highlightRect && (
            <div 
              className={styles.highlight}
              style={{
                top: highlightRect.top - 8,
                left: highlightRect.left - 8,
                width: highlightRect.width + 16,
                height: highlightRect.height + 16,
              }}
            />
          )}

          {/* Guide List */}
          {showGuideList && !activeGuide && (
            <div className={styles.guideList}>
              <div className={styles.guideListHeader}>
                <h2>Help & Guides</h2>
                <button className={styles.closeBtn} onClick={closeGuide}>×</button>
              </div>
              <p className={styles.guideListIntro}>
                Choose a guide to learn about Rovora features
              </p>
              <div className={styles.guides}>
                {availableGuides.map(guide => {
                  const isCompleted = completedGuides.includes(guide.id);
                  return (
                    <button
                      key={guide.id}
                      className={`${styles.guideItem} ${isCompleted ? styles.completed : ''}`}
                      onClick={() => startGuide(guide)}
                    >
                      <span className={styles.guideIcon}>{guide.icon}</span>
                      <div className={styles.guideInfo}>
                        <span className={styles.guideName}>{guide.name}</span>
                        <span className={styles.guideDesc}>{guide.description}</span>
                      </div>
                      {isCompleted && (
                        <span className={styles.checkmark}>✓</span>
                      )}
                      <span className={styles.arrow}>→</span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.guideListFooter}>
                <button className={styles.skipBtn} onClick={closeGuide}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Active Step Tooltip */}
          {activeGuide && activeGuide.steps[currentStep] && (
            <div 
              key={`${activeGuide.id}-${currentStep}`}
              className={`${styles.tooltip} ${getArrowClass()}`}
              style={getTooltipStyle()}
            >
              <div className={styles.tooltipHeader}>
                <span className={styles.stepIndicator}>
                  {currentStep + 1} / {activeGuide.steps.length}
                </span>
                <button className={styles.closeBtn} onClick={closeGuide}>×</button>
              </div>
              <h3 className={styles.tooltipTitle}>
                {activeGuide.steps[currentStep].title}
              </h3>
              <p className={styles.tooltipContent}>
                {activeGuide.steps[currentStep].content}
              </p>
              <div className={styles.tooltipActions}>
                {currentStep > 0 ? (
                  <button className={styles.backBtn} onClick={prevStep}>
                    ← Back
                  </button>
                ) : (
                  <button className={styles.skipBtn} onClick={closeGuide}>
                    Skip Tour
                  </button>
                )}
                <button className={styles.nextBtn} onClick={nextStep}>
                  {currentStep === activeGuide.steps.length - 1 
                    ? 'Get Started' 
                    : activeGuide.steps[currentStep].actionLabel || 'Next →'
                  }
                </button>
              </div>
              <div className={styles.progressDots}>
                {activeGuide.steps.map((_, i) => (
                  <span 
                    key={i} 
                    className={`${styles.dot} ${i === currentStep ? styles.active : ''} ${i < currentStep ? styles.completed : ''}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
