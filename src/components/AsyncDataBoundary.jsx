import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import SkeletonLoader from './SkeletonLoader.jsx';
import StateBlock from './StateBlock.jsx';

/**
 * @typedef {Object} AsyncDataBoundaryProps
 * @property {string} [domain]
 * @property {import('react').ReactNode} [children]
 * @property {import('react').ReactNode} [fallback]
 * @property {'row' | 'card' | 'asset'} [skeletonType]
 * @property {number} [skeletonCount]
 * @property {string} [skeletonHeight]
 * @property {string} [emptyTitle]
 * @property {string} [emptyBody]
 * @property {string} [emptyIcon]
 * @property {string} [emptyBtn]
 * @property {() => void} [onEmptyAction]
 * @property {boolean} [loading]
 * @property {boolean} [empty]
 * @property {string | boolean} [error]
 * @property {string} [role]
 * @property {string} [ariaLive]
 */

/**
 * Reusable layout-stable wrapper component that tracks active async network requests
 * and zero-data states per resource domain.
 * @param {AsyncDataBoundaryProps} props
 */
export default function AsyncDataBoundary({
  domain = '',
  children = null,
  fallback = null,
  skeletonType = 'row',
  skeletonCount = 3,
  skeletonHeight = '120px',
  emptyTitle = '',
  emptyBody = '',
  emptyIcon = '',
  emptyBtn = '',
  onEmptyAction = undefined,
  loading: propLoading = undefined,
  empty: propEmpty = undefined,
  error: propError = undefined,
  role = 'status',
  ariaLive = 'polite',
}) {
  const { state } = useApp() || {};
  const domainState =
    domain && state?.asyncDataState?.[domain]
      ? state.asyncDataState[domain]
      : { status: 'idle', error: null, itemCount: 0 };

  const isLoading =
    propLoading !== undefined ? Boolean(propLoading) : domainState.status === 'loading';
  const isError = propError !== undefined ? Boolean(propError) : domainState.status === 'error';
  const errorMessage =
    typeof propError === 'string' ? propError : domainState.error || 'Failed to load data.';
  const isEmpty = propEmpty !== undefined ? Boolean(propEmpty) : domainState.status === 'empty';

  if (isLoading) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        role={role}
        aria-live={ariaLive}
        aria-busy="true"
        data-testid={`async-data-boundary-loading-${domain || 'default'}`}
        style={{ width: '100%', padding: '12px 0' }}
      >
        <SkeletonLoader type={skeletonType} count={skeletonCount} height={skeletonHeight} />
      </div>
    );
  }

  if (isError) {
    return (
      <StateBlock
        domain={domain}
        status="error"
        title="ERROR LOADING DATA"
        body={errorMessage}
        icon="plug-zap"
        btn="RETRY"
        onAction={onEmptyAction}
        role={role}
        ariaLive={ariaLive}
      />
    );
  }

  if (isEmpty) {
    return (
      <StateBlock
        domain={domain}
        status="empty"
        title={emptyTitle || `NO ${domain ? domain.toUpperCase() : 'RECORDS'}`}
        body={emptyBody || `No ${domain || 'data'} items were found in this view.`}
        icon={emptyIcon || 'inbox'}
        btn={emptyBtn}
        onAction={onEmptyAction}
        role={role}
        ariaLive={ariaLive}
      />
    );
  }

  return <>{children}</>;
}
