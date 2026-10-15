import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FinanceProfile } from "../../domain/profiles";
import { createCsvExportReceiptStore } from "./csvExportReceipts";

export const getCsvExportReceiptStore = (profile: FinanceProfile) =>
  createCsvExportReceiptStore(AsyncStorage, profile);
