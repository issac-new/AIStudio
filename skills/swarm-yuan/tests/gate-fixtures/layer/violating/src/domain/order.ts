// domain 层：违规样本——向上 import app 层（层穿透）+ import 框架 express（领域污染）
import express from 'express';
import { bootstrap } from '../app/main';

export function createOrder(id: number): string {
  return `order-${id}`;
}
