-- One-time maintenance repair, confirmed by the operator on 2026-09-24.
-- Requires equipment_available_stock migration. No transaction/payment rewrites.
-- Exact source stock and per-size availability must still match the confirmation.
-- Run the complete transaction. Change the final COMMIT to ROLLBACK for a dry run.
begin;
do $repair$
declare
  v_targets jsonb := '[
  {
    "id": "c9e71724-166e-4db2-8fcc-180ddb28208d",
    "before": 70,
    "available": 60,
    "raw": [
      {
        "size": "XS(52cm)",
        "quantity": 20
      },
      {
        "size": "S（54cm）",
        "quantity": 1
      },
      {
        "size": "M（56cm）",
        "quantity": 60
      },
      {
        "size": "L（58cm）",
        "quantity": 5
      },
      {
        "size": "XL（60cm）",
        "quantity": 3
      }
    ],
    "counts": [
      20,
      0,
      38,
      2,
      0
    ]
  },
  {
    "id": "d3524bec-6a69-49a9-b44b-9fbe697b832d",
    "before": 22,
    "available": 0,
    "raw": [
      {
        "size": "S (52mm-54mm)",
        "quantity": 1
      },
      {
        "size": "M (54mm-56mm)",
        "quantity": 6
      },
      {
        "size": "L (56mm-58mm)",
        "quantity": 12
      },
      {
        "size": "XL (58mm-60mm)",
        "quantity": 2
      }
    ],
    "counts": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": "f496e521-0827-47fa-9326-894a424cd3bb",
    "before": 120,
    "available": 4,
    "raw": [
      {
        "size": "S",
        "quantity": 2
      },
      {
        "size": "M",
        "quantity": 2
      },
      {
        "size": "L",
        "quantity": 4
      },
      {
        "size": "XL",
        "quantity": 3
      },
      {
        "size": "2XL",
        "quantity": 2
      },
      {
        "size": "3XL",
        "quantity": 3
      },
      {
        "size": "4XL",
        "quantity": 2
      }
    ],
    "counts": [
      0,
      1,
      2,
      1,
      0,
      0,
      0
    ]
  },
  {
    "id": "c6114e6f-816b-4dde-b46d-721dd570445b",
    "before": 120,
    "available": 1,
    "raw": [
      {
        "size": "M",
        "quantity": 2
      },
      {
        "size": "L",
        "quantity": 5
      },
      {
        "size": "XL",
        "quantity": 2
      },
      {
        "size": "2XL",
        "quantity": 1
      },
      {
        "size": "3XL",
        "quantity": 2
      },
      {
        "size": "4XL",
        "quantity": 2
      }
    ],
    "counts": [
      0,
      1,
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": "ab641c48-440c-4f66-b815-923105547b17",
    "before": 100,
    "available": 120,
    "raw": [
      {
        "size": "M",
        "quantity": 20
      },
      {
        "size": "L",
        "quantity": 20
      },
      {
        "size": "XL",
        "quantity": 20
      },
      {
        "size": "2XL",
        "quantity": 20
      },
      {
        "size": "3XL",
        "quantity": 20
      },
      {
        "size": "4XL",
        "quantity": 20
      }
    ],
    "counts": [
      20,
      20,
      20,
      20,
      20,
      20
    ]
  },
  {
    "id": "ed842b15-2a20-4d42-b907-7e28edb3ca0b",
    "before": 92,
    "available": 94,
    "raw": [
      {
        "size": "2XS",
        "quantity": 20
      },
      {
        "size": "XS",
        "quantity": 36
      },
      {
        "size": "S",
        "quantity": 20
      },
      {
        "size": "M",
        "quantity": 13
      },
      {
        "size": "L",
        "quantity": 7
      },
      {
        "size": "XL",
        "quantity": 6
      },
      {
        "size": "2L",
        "quantity": 5
      },
      {
        "size": "3L",
        "quantity": 5
      }
    ],
    "counts": [
      20,
      28,
      13,
      11,
      7,
      5,
      5,
      5
    ]
  },
  {
    "id": "ad6922e9-afd7-40bf-9903-bda3f91fc676",
    "before": 20,
    "available": 58,
    "raw": [
      {
        "size": "S",
        "quantity": 10
      },
      {
        "size": "M",
        "quantity": 10
      },
      {
        "size": "L",
        "quantity": 10
      },
      {
        "size": "XL",
        "quantity": 10
      },
      {
        "size": "2XL",
        "quantity": 10
      },
      {
        "size": "3XL",
        "quantity": 10
      }
    ],
    "counts": [
      10,
      10,
      9,
      10,
      9,
      10
    ]
  }
]'::jsonb;
  v_target jsonb;
  v_equipment public.equipment%rowtype;
  v_snapshot jsonb;
  v_raw jsonb;
  v_total integer;
  v_used integer;
  v_before integer;
begin
  perform e.id from public.equipment e
    where e.id in (select (value->>'id')::uuid from jsonb_array_elements(v_targets))
    order by e.id for update;
  for v_target in select value from jsonb_array_elements(v_targets)
  loop
    select * into strict v_equipment from public.equipment where id = (v_target->>'id')::uuid;
    v_raw := v_target->'raw';
    if v_equipment.sizes_stock is distinct from v_raw then
      raise exception '尺寸資料已變更，停止修正：%', v_equipment.name;
    end if;
    with allocation as (
      select nullif(btrim(t.size),'') size,
        sum(case when t.transaction_type in ('borrow','receive','purchase') then t.quantity
          when t.transaction_type = 'return' then -t.quantity else 0 end)::integer used,
        0::integer reserved
      from public.equipment_transactions t where t.equipment_id = v_equipment.id
      group by nullif(btrim(t.size),'')
      union all
      select nullif(btrim(i.size),''),0,sum(i.quantity)::integer
      from public.equipment_purchase_request_items i
      join public.equipment_purchase_requests r on r.id = i.request_id
      where i.equipment_id = v_equipment.id and r.status in ('approved','ready_for_pickup')
        and i.equipment_transaction_id is null
      group by nullif(btrim(i.size),'')
    ), net as (select size,sum(used)::integer used,sum(reserved)::integer reserved from allocation group by size)
    select coalesce(jsonb_agg(to_jsonb(net)),'[]'::jsonb) into v_snapshot from net;
    if exists (
      select 1 from jsonb_array_elements(v_snapshot) n where (n->>'used')::int < 0
        or ((n->>'used')::int + (n->>'reserved')::int <> 0 and not exists (
          select 1 from jsonb_array_elements(v_raw) s where s->>'size' = n->>'size'
        ))
    ) then raise exception '交易尺寸異常，停止修正：%', v_equipment.name; end if;
    if exists (
      select 1 from jsonb_array_elements(v_raw) with ordinality s(item,ord)
      where (item->>'quantity')::int - coalesce((
        select sum((n->>'used')::int + (n->>'reserved')::int)
        from jsonb_array_elements(v_snapshot) n where n->>'size' = item->>'size'
      ),0) <> (v_target->'counts'->>(ord::int-1))::int
    ) then raise exception '可用數量已變更，請重新核對：%', v_equipment.name; end if;
    select sum((s->>'quantity')::int) into v_total from jsonb_array_elements(v_raw) s;
    select coalesce(sum((n->>'used')::int + (n->>'reserved')::int),0) into v_used from jsonb_array_elements(v_snapshot) n;
    if v_total - v_used <> (v_target->>'available')::int then
      raise exception '尺寸加總不符合核對數量：%', v_equipment.name;
    end if;
    -- A successful rerun is a no-op; never duplicate the adjustment ledger.
    if v_equipment.total_quantity = v_total then continue; end if;
    if v_equipment.total_quantity <> (v_target->>'before')::int then
      raise exception '整體數量已變更，停止修正：%', v_equipment.name;
    end if;
    v_before := greatest(v_equipment.total_quantity - v_used,0);
    update public.equipment set total_quantity = v_total, updated_at = clock_timestamp()
      where id = v_equipment.id;
    insert into public.equipment_inventory_adjustments (
      equipment_id, adjustment_type, adjustment_date, handled_by, quantity_delta,
      total_quantity_after, sizes_stock_after, notes, created_by,
      available_quantity_before, available_quantity_after
    ) values (
      v_equipment.id,'stock_set',(now() at time zone 'Asia/Taipei')::date,
      'Codex（依管理者確認修正）',abs((v_target->>'available')::int-v_before),
      v_total,v_raw,
      format('2026-09-24 管理者確認各尺寸可用數量後核對修正。整體基準由 %s 改為尺寸加總 %s；各尺寸、交易與付款紀錄保持原值。',v_equipment.total_quantity,v_total),
      null,v_before,(v_target->>'available')::int
    );
  end loop;
end;
$repair$;
select e.name,a.available_quantity_before,a.available_quantity_after,a.total_quantity_after
from public.equipment_inventory_adjustments a join public.equipment e on e.id=a.equipment_id
where a.created_at = transaction_timestamp() and a.handled_by='Codex（依管理者確認修正）'
order by e.name;
commit;
