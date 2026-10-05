import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@/app/i18n'
import { ImportModal } from './ImportModal'

describe('ImportModal', () => {
  it('detects separators from pasted text and imports the preview', () => {
    const onImport = vi.fn()
    render(<ImportModal open onClose={() => {}} onImport={onImport} />)
    const ta = screen.getByRole('textbox', { name: /tekst plakken|paste text/i })
    fireEvent.change(ta, { target: { value: 'hond - dog\nkat - cat' } })
    // custom separator " - " detected → two preview rows
    expect(screen.getAllByDisplayValue('hond')).toHaveLength(1)
    expect(screen.getByDisplayValue('cat')).toBeInTheDocument()
    const importBtn = screen.getByRole('button', { name: /importeren \(2\)|import \(2\)/i })
    fireEvent.click(importBtn)
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0]).toEqual([
      { term: 'hond', definition: 'dog', hint: undefined, cloze: undefined, tags: undefined, image: undefined },
      { term: 'kat', definition: 'cat', hint: undefined, cloze: undefined, tags: undefined, image: undefined },
    ])
  })

  it('swaps sides and lets you edit the preview', () => {
    const onImport = vi.fn()
    render(<ImportModal open onClose={() => {}} onImport={onImport} />)
    fireEvent.change(screen.getByRole('textbox', { name: /tekst plakken|paste text/i }), { target: { value: 'hond\tdog' } })
    fireEvent.click(screen.getByRole('button', { name: /omwisselen|swap/i }))
    expect(screen.getByDisplayValue('dog')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('hond'), { target: { value: 'de hond' } })
    fireEvent.click(screen.getByRole('button', { name: /importeren \(1\)|import \(1\)/i }))
    expect(onImport.mock.calls[0][0][0]).toMatchObject({ term: 'dog', definition: 'de hond' })
  })

  it('renders nothing when closed', () => {
    const { container } = render(<ImportModal open={false} onClose={() => {}} onImport={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
