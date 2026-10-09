import React, { useId } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

function findControlId(child, fallbackId) {
  if (!React.isValidElement(child)) return fallbackId;
  if (child.props && child.props.id) return child.props.id;
  if (typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)) {
    return child.props.id || fallbackId;
  }
  if (child.props && child.props.children) {
    const childrenArray = React.Children.toArray(child.props.children);
    for (const c of childrenArray) {
      if (React.isValidElement(c)) {
        const id = findControlId(c, null);
        if (id) return id;
      }
    }
  }
  return fallbackId;
}

function cloneControlWithAria(element, ariaProps) {
  if (!React.isValidElement(element)) return element;

  if (typeof element.type === 'string' && ['input', 'select', 'textarea'].includes(element.type)) {
    return React.cloneElement(element, {
      id: element.props.id || ariaProps.id,
      'aria-invalid': ariaProps['aria-invalid'],
      'aria-errormessage': ariaProps['aria-errormessage'],
      'aria-describedby': element.props['aria-describedby']
        ? `${element.props['aria-describedby']} ${ariaProps['aria-describedby'] || ''}`.trim()
        : ariaProps['aria-describedby'],
    });
  }

  if (element.props && element.props.children) {
    let applied = false;
    const processChildren = (children) => {
      return React.Children.map(children, (child) => {
        if (!applied && React.isValidElement(child)) {
          if (
            typeof child.type === 'string' &&
            ['input', 'select', 'textarea'].includes(child.type)
          ) {
            applied = true;
            return cloneControlWithAria(child, ariaProps);
          }
          if (child.props && child.props.children) {
            const updated = processChildren(child.props.children);
            if (applied) {
              return React.cloneElement(child, {}, updated);
            }
          }
        }
        return child;
      });
    };

    const updatedChildren = processChildren(element.props.children);
    if (applied) {
      return React.cloneElement(element, {}, updatedChildren);
    }
  }

  return React.cloneElement(element, {
    id: ariaProps.id,
    'aria-invalid': ariaProps['aria-invalid'],
    'aria-errormessage': ariaProps['aria-errormessage'],
    'aria-describedby': element.props['aria-describedby']
      ? `${element.props['aria-describedby']} ${ariaProps['aria-describedby'] || ''}`.trim()
      : ariaProps['aria-describedby'],
  });
}

/**
 * @param {object} props
 * @param {React.ReactNode} [props.label]
 * @param {React.ReactNode} [props.error]
 * @param {React.ReactNode} [props.helpText]
 * @param {React.ReactNode} [props.children]
 * @param {React.CSSProperties} [props.style]
 */
export default function FormField({
  label = undefined,
  error = undefined,
  helpText = undefined,
  children = undefined,
  style = undefined,
}) {
  const theme = useTheme();
  const V = theme?.V || {};
  const typography = theme?.t || {};
  const fontStyle = typography.font || 'sans-serif';

  const fieldId = useId();
  const hasError = Boolean(error);

  const childId = findControlId(children, fieldId);
  const errorId = `${childId}-error`;
  const helpId = `${childId}-help`;

  const describedBy =
    [helpText ? helpId : null, hasError ? errorId : null].filter(Boolean).join(' ') || undefined;

  const childWithAria = React.isValidElement(children)
    ? cloneControlWithAria(children, {
        id: childId,
        'aria-invalid': hasError ? 'true' : undefined,
        'aria-errormessage': hasError ? errorId : undefined,
        'aria-describedby': children.props['aria-describedby']
          ? `${children.props['aria-describedby']} ${describedBy || ''}`.trim()
          : describedBy,
      })
    : children;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label ? (
        <label
          htmlFor={childId}
          style={{ font: `600 10px/1 ${fontStyle}`, letterSpacing: '.16em', color: V.pri }}
        >
          {label}
        </label>
      ) : null}
      {childWithAria}
      {helpText ? (
        <small id={helpId} style={{ color: V.ink2, fontSize: 11 }}>
          {helpText}
        </small>
      ) : null}
      {hasError ? (
        <div
          id={errorId}
          role="alert"
          style={{ color: V.err || '#ff4d4d', fontSize: 12, marginTop: 2 }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
