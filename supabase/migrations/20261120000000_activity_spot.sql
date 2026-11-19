-- Νέα δραστηριότητα «Σημείο»: μόνο σημείο συνάντησης, χωρίς μαγαζιά.
-- (Χωριστό αρχείο: η νέα τιμή enum δεν μπορεί να χρησιμοποιηθεί στην ίδια συναλλαγή που προστίθεται.)
alter type public.activity_kind add value if not exists 'spot' before 'coffee';
