import { type CustomField } from '../../api/settings';

type Props = {
  fields: CustomField[];
  values: Record<number, string>;
  onChange: (fieldId: number, value: string) => void;
};

/**
 * Renders custom fields dynamically based on field type.
 * Supports: TEXT, TEXTAREA, NUMBER, DATE, SELECT, MULTI_SELECT, CHECKBOX
 */
export function CustomFieldsForm({ fields, values, onChange }: Props) {
  if (fields.length === 0) return null;

  return (
    <div className="border-t border-[var(--hairline)] pt-6">
      <h3 className="text-[var(--ink)] mb-4">自定义字段</h3>
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.id}>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">
              {field.fieldName}
              {field.required && <span className="text-[var(--destructive)] ml-0.5">*</span>}
            </label>
            {renderField(field, values[field.id] || '', onChange)}
            {field.placeholder && (
              <p className="text-xs text-[var(--ink-muted-48)] mt-1">{field.placeholder}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderField(
  field: CustomField,
  value: string,
  onChange: (fieldId: number, value: string) => void
) {
  const commonClass =
    'w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm';

  switch (field.fieldType) {
    case 'TEXTAREA':
      return (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={`${commonClass} resize-none`}
        />
      );

    case 'NUMBER':
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={commonClass}
        />
      );

    case 'DATE':
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={commonClass}
        />
      );

    case 'SELECT':
      return (
        <select
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={commonClass}
        >
          <option value="">请选择</option>
          {(field.options as string[] | undefined)?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'MULTI_SELECT':
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options as string[] | undefined)?.map((opt) => {
            const selected = value.split(',').map((s) => s.trim()).includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const current = value.split(',').map((s) => s.trim()).filter(Boolean);
                  const next = selected
                    ? current.filter((s) => s !== opt)
                    : [...current, opt];
                  onChange(field.id, next.join(','));
                }}
                className={`px-3 py-1.5 rounded-[1px] text-xs font-medium transition-colors ${
                  selected
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--canvas-parchment)] text-[var(--ink-muted-80)] border border-[var(--hairline)]'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );

    case 'CHECKBOX':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true' || value === '1' || value === '是'}
            onChange={(e) => onChange(field.id, e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)]"
          />
          <span className="text-sm text-[var(--ink-muted-80)]">
            {field.placeholder || '是'}
          </span>
        </label>
      );

    default: // TEXT
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={commonClass}
        />
      );
  }
}
