
# Polling steps

## thoughts

1. if upsert is NOT possible OR the table does NOT have a sys_updated_on column, use `order by sys_created_on`
2. if upsert IS possible, use `order by sys_updated_on`  
   can cause endless jobs in case the records are heavily updated (end row shifts down all the time)
3. an empty pages can be caused by ACL and does not automatically indicate end of the data set
4. there is a risk that all records on one page do have the same sys_updated_on value  
   therefore we also sort by sys_id and use it in the query

## threading - Threads: 4
 
1:  sys_id                  < 444444444
2:  sys_id >= 4444444444  & < 88888888 
3:  sys_id >= 88888888    & < aaaaaaaaaaaa
4:  sys_id >= aaaaaaaaaa
  
Cloning issues:  

- aggregate max(sys_updated_on) SNOW  
- Math.floor(max_snow(sys_updated_on), max_db(sys_updated_on))
 
## full load
PAGE 1

```SQL
select 
    *
from 
    table
where
    (sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id) )
    -- -> if there are NO rows on the page, use the next link!
 
order by
    sys_updated_on ASC, sys_id ASC

limit 2000

```
 
## full load 2
PAGE 1

```SQL
select 
    *
from 
    table
where

    if(last_page_max_first_row(sys_updated_on) ==  last_page_max_last_row(sys_updated_on)){
        -- there could be more on another page
        -- run a sub-select with:
        -- sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id)
    } else if (rowCount == 0) {
        -- there could be an ACL on the table or we're at the end
        -- to check, run a sub-select by following the Next Header Link
        --  --> there is a potential risk of missing records when following the next link!

    }

    sys_updated_on > last_page_max(sys_updated_on) || (sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id) )
    -- -> if there are NO rows on the page, use the next link!
 
order by
    sys_updated_on ASC, sys_id ASC

limit 2000

```

## increment load

```SQL
select 
    *
from 
    table
where
    sys_update_on > Math.floor(max_snow(sys_updated_on), max_db(sys_updated_on))
    and
    (sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id) )
    -- -> if there are NO rows on the page, use the next link!
 
order by
    sys_updated_on, sys_id
```

-> stop at the #row >= count()
max-jobs = (count() / page-size ) + 10%
 
