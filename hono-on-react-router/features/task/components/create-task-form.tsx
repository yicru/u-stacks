import { type FormEvent, useState } from 'react'
import { useRevalidator } from 'react-router'
import { client } from '../../../server/client'

export function CreateTaskForm() {
  const [value, setValue] = useState('')
  const revalidator = useRevalidator()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    await client.api.tasks.$post({
      json: {
        title: value,
      },
    })

    alert('created')
    setValue('')
    await revalidator.revalidate()
  }

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <input
        value={value}
        id="title"
        type="text"
        className="h-9 flex-1 rounded border border-neutral-300 px-3 py-2 shadow-sm"
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="submit"
        className="h-9 rounded bg-black px-4 text-sm text-white"
      >
        Submit
      </button>
    </form>
  )
}
